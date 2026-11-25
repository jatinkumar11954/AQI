import { z } from 'zod';
import { EMPTY_ENV, HOUR, TIMEZONE, citySchema, type AirPoint, type City, type Environment, type Station, type Weather } from './model';
import { createCache, createLimiter, createTransport, UpstreamError, url, type Fetcher } from './upstream';

const scalar = z.number().min(0);
const nonnegative = (value: unknown) => scalar.safeParse(value).data ?? null;
const number = (value: unknown) => z.number().safeParse(value).data ?? null;
const unix = z.number().int().min(1_500_000_000).max(4_100_000_000);
const timestamp = (value: unknown) => unix.safeParse(value).data;
const row = z.record(z.string(), z.unknown());
const body = z.object({ current: row.optional(), hourly: row.optional() });
const list = z.array(z.unknown()).max(96).optional();
const apiAQI = (value: unknown) => z.number().int().min(0).max(5000).safeParse(value).data ?? null;

function airPoint(time: number, aqi: unknown, pm25: unknown, pm10: unknown): AirPoint {
  return { time, aqi: apiAQI(aqi), pm25: nonnegative(pm25), pm10: nonnegative(pm10) };
}
export function parseAir(input: unknown, now: number) {
  const { current, hourly } = body.parse(input);
  const validTime = timestamp(current?.time);
  const snapshot = validTime && current ? airPoint(validTime, current.us_aqi, current.pm2_5, current.pm10) : null;
  const bins = z.object({ time: list, us_aqi: list, pm2_5: list, pm10: list }).parse(hourly ?? {});
  const rows = new Map<number, AirPoint>();
  for (const [index, rawTime] of (bins.time ?? []).entries()) {
    const stamp = timestamp(rawTime);
    if (stamp == null) continue;
    rows.set(stamp, airPoint(stamp, bins.us_aqi?.[index], bins.pm2_5?.[index], bins.pm10?.[index]));
  }
  const hourlyRows = Array.from(rows.values()).sort((a, b) => a.time - b.time);
  if (!snapshot && !hourlyRows.length) throw new UpstreamError(502);
  return { current: snapshot, hourly: hourlyRows, fetchedAt: now };
}

const locations = z.object({
  results: z.array(z.object({
    id: z.number().int().positive(), name: z.string(), distance: z.number().nonnegative().nullable().optional(),
    owner: z.object({ name: z.string() }).nullable().optional(),
    provider: z.object({ name: z.string() }),
    sensors: z.array(z.object({ id: z.number().int(), parameter: z.object({ name: z.string(), units: z.string() }) })),
  })).max(12),
});
const latest = z.object({
  results: z.array(z.object({ sensorsId: z.number(), value: z.number(), datetime: z.object({ utc: z.iso.datetime({ offset: true }) }) })).max(100),
});
function hasPm(parameter: { name: string; units: string }) {
  return ['pm25', 'pm10'].includes(parameter.name) && ['µg/m³', 'μg/m³', 'ug/m3'].includes(parameter.units);
}

export function createEnvironment(fetcher: Fetcher, clock: () => number) {
  const request = createTransport(fetcher);
  const airCache = createCache<ReturnType<typeof parseAir>>(384, 480, 3 * HOUR, clock);
  const weatherCache = createCache<Weather>(384, 720, 2 * HOUR, clock);
  const relayCache = createCache<Station | null>(384, 600, 12 * HOUR, clock);
  const stationCache = createCache<Station | null>(384, 900, 12 * HOUR, clock);
  const searchCache = createCache<City[]>(384, 3600, 86400, clock);
  const providers = createLimiter(clock);
  const hourlyQuota = createLimiter(clock, HOUR);
  const airURL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
  const weatherURL = 'https://api.open-meteo.com/v1/forecast';
  const stationURL = 'https://api.openaq.org/v3/locations';

  async function station(lat: number, lon: number, apiKey: string) {
    // At most two requests per cache miss, with no retries on the station feed.
    if (!providers('openaq', 24) || !hourlyQuota('openaq', 900)) throw new UpstreamError(429);
    const headers = { 'X-API-Key': apiKey };
    const response = await request(url(stationURL, {
      coordinates: lat + ',' + lon, radius: 25000, limit: 10, iso: 'IN',
      monitor: 'true', mobile: 'false',
    }), { headers }, 0);
    const known = locations.parse(response).results.filter(location =>
      location.distance != null && location.distance <= 25000 && location.sensors.some(sensor => hasPm(sensor.parameter))
    ).sort((a, b) => a.distance! - b.distance!);
    const nearest = known[0];
    if (!nearest) return null;
    const payload = latest.parse(await request(url(stationURL + '/' + nearest.id + '/latest', { limit: 100 }), { headers }, 0));
    const now = clock();
    const find = (name: string) => {
      const ids = new Set(nearest.sensors.filter(sensor => hasPm(sensor.parameter) && sensor.parameter.name === name).map(sensor => sensor.id));
      const result = payload.results.filter(record => ids.has(record.sensorsId) && record.value >= 0)
        .map(record => ({ value: record.value, time: Date.parse(record.datetime.utc) / 1000 }))
        .filter(record => record.time <= now + 300 && record.time >= now - 48 * HOUR)
        .sort((a, b) => b.time - a.time)[0];
      return result ?? null;
    };
    return {
      kind: 'openaq' as const, id: nearest.id, name: nearest.name, owner: nearest.owner?.name ?? nearest.provider.name,
      provider: nearest.provider.name, distance: nearest.distance! / 1000, pm25: find('pm25'), pm10: find('pm10'),
    };
  }

  async function relayStation(lat: number, lon: number): Promise<Station | null> {
    if (!providers('cpcb-relay', 36)) throw new UpstreamError(429);
    const payload = z.object({ data: z.array(z.object({
      station: z.string().max(150), updated: z.string(),
      distance_km: z.number().min(0),
      aqi: z.number().int().min(0).max(500).nullable(), pollutants: row,
    })).max(5) }).parse(await request(url('https://api.dharun.dev/v1/air-quality', { near: lat + ',' + lon }), {}, 0));
    const now = clock();
    const index = (raw: unknown) => {
      const result = z.object({ avg: z.number().min(0).max(500).nullable() }).safeParse(raw);
      return result.success ? result.data.avg : null;
    };
    const candidates: Station[] = [];
    for (const item of payload.data) {
      const stamp = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(?::(\d{2}))?$/.exec(item.updated);
      if (!stamp || item.distance_km > 25) continue;
      const time = Date.parse(stamp[1] + 'T' + stamp[2] + ':' + (stamp[3] ?? '00') + '+05:30') / 1000;
      if (!Number.isFinite(time) || time > now + 300 || time < now - 48 * HOUR) continue;
      const pm25Index = index(item.pollutants['PM2.5']);
      const pm10Index = index(item.pollutants.PM10);
      if (pm25Index == null && pm10Index == null) continue;
      candidates.push({
        kind: 'cpcb-relay', name: item.station, owner: 'CPCB monitoring network', provider: 'India API / data.gov.in',
        distance: item.distance_km, aqi: item.aqi, time, pm25Index, pm10Index,
      });
    }
    return candidates.sort((a, b) => a.distance - b.distance)[0] ?? null;
  }

  const mostRecent = (entry: Station) => entry.kind === 'cpcb-relay' ? entry.time : Math.max(entry.pm25?.time ?? 0, entry.pm10?.time ?? 0);
  async function observation(key: string, lat: number, lon: number, openaqApiKey: string | undefined) {
    let openAQ;
    if (openaqApiKey) {
      openAQ = await stationCache(key, () => station(lat, lon, openaqApiKey)).catch(() => null);
      if (openAQ?.value && !openAQ.stale && clock() - mostRecent(openAQ.value) <= 3 * HOUR) return openAQ;
    }
    const relay = await relayCache(key, () => relayStation(lat, lon)).catch(() => null);
    if (relay?.value) return relay;
    if (openAQ?.value) return openAQ;
    return relay;
  }

  return {
    async search(query: string): Promise<City[]> {
      const key = query.toLowerCase();
      const cached = await searchCache(key, async () => {
        if (!providers('search', 24)) throw new UpstreamError(429);
        const response = await request(url('https://geocoding-api.open-meteo.com/v1/search', { name: query, count: 8, countryCode: 'IN', language: 'en' }));
        return z.object({ results: z.array(row).max(20).optional() }).parse(response).results?.flatMap(entry => {
          if (entry.country_code !== 'IN') return [];
          const city = citySchema.safeParse({ name: entry.name, state: entry.admin1 ?? '', lat: entry.latitude, lon: entry.longitude });
          return city.success ? [city.data] : [];
        }) ?? [];
      });
      return cached.value;
    },
    async get(coords: { lat: number; lon: number }, openaqApiKey?: string): Promise<Environment> {
      const lat = Number(coords.lat.toFixed(2));
      const lon = Number(coords.lon.toFixed(2));
      const key = lat + ',' + lon;
      const base = { latitude: lat, longitude: lon, timezone: TIMEZONE, timeformat: 'unixtime' };
      const [air, weather, observed] = await Promise.allSettled([
        airCache(key, async () => {
          if (!providers('model', 45)) throw new UpstreamError(429);
          return parseAir(await request(url(airURL, {
            ...base, current: 'us_aqi,pm2_5,pm10', hourly: 'us_aqi,pm2_5,pm10', forecast_days: 3,
          })), clock());
        }),
        weatherCache(key, async () => {
          if (!providers('weather', 45)) throw new UpstreamError(429);
          const { current } = body.parse(await request(url(weatherURL, {
            ...base, current: 'temperature_2m,relative_humidity_2m,wind_speed_10m', forecast_days: 1,
          })));
          const time = timestamp(current?.time);
          if (!current || time == null) throw new UpstreamError(502);
          return { time, temperature: number(current.temperature_2m), humidity: nonnegative(current.relative_humidity_2m), wind: nonnegative(current.wind_speed_10m) };
        }),
        observation(key, lat, lon, openaqApiKey),
      ]);
      const now = clock();
      const out = { ...EMPTY_ENV };
      if (air.status === 'fulfilled') {
        out.air = air.value.value;
        const currentTime = out.air.current?.time;
        const future = out.air.hourly.some(point => point.time >= now && point.time <= now + 2 * HOUR);
        const oldCurrent = currentTime != null && (now - currentTime > 2 * HOUR || currentTime > now + 900);
        out.airStatus = air.value.stale || !future || oldCurrent ? 'stale' : 'fresh';
      }
      if (weather.status === 'fulfilled' && !weather.value.stale && now - weather.value.value.time <= 2 * HOUR
        && weather.value.value.time <= now + 900) out.weather = weather.value.value;
      out.stationStatus = 'unavailable';
      if (observed.status === 'fulfilled' && observed.value) {
        out.station = observed.value.value;
        if (!out.station) out.stationStatus = 'no-station';
        else {
          const lastMeasurement = mostRecent(out.station);
          if (lastMeasurement) out.stationStatus = !observed.value.stale && now - lastMeasurement <= 3 * HOUR ? 'fresh' : 'stale';
        }
      }
      return out;
    },
  };
}
