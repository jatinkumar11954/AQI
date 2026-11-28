import { z } from 'zod';
import {
  EMPTY_ENV,
  HOUR,
  OBSERVATION_MAX_AGE,
  TIMEZONE,
  airTimestamp,
  citySchema,
  concentration,
  modeledAqi,
  type AirPoint,
  type City,
  type Environment,
  type IndiaStation,
  type Station,
  type Weather,
} from './model.js';
import { createCache, createLimiter, createTransport, UpstreamError, url, type Fetcher } from './upstream.js';

const nonnegative = (value: unknown) => concentration.safeParse(value).data ?? null;
const number = (value: unknown) => z.number().safeParse(value).data ?? null;
const timestamp = (value: unknown) => airTimestamp.safeParse(value).data;
const row = z.record(z.string(), z.unknown());
const body = z.object({ current: row.optional(), hourly: row.optional() });
const list = z.array(z.unknown()).max(96).optional();
const hourlyBins = z.object({ time: list, us_aqi: list, pm2_5: list, pm10: list });

const OPENAQ_LOCATION_LIMIT = 80;
const locations = z.object({
  results: z.array(z.object({
    id: z.number().int().positive(),
    name: z.string(),
    distance: z.number().nonnegative().nullable().optional(),
    owner: z.object({ name: z.string() }).nullable().optional(),
    provider: z.object({ name: z.string() }),
    datetimeLast: z.object({ utc: z.iso.datetime({ offset: true }) }).nullish(),
    sensors: z.array(z.object({ id: z.number().int(), parameter: z.object({ name: z.string(), units: z.string() }) })),
  })).max(OPENAQ_LOCATION_LIMIT),
});
const latest = z.object({
  results: z.array(z.object({
    sensorsId: z.number(),
    value: z.number(),
    datetime: z.object({ utc: z.iso.datetime({ offset: true }) }),
  })).max(100),
});
const pollutantIndex = z.object({ avg: z.number().min(0).max(500).nullable() });
const relayPayload = z.object({
  data: z.array(z.object({
    station: z.string().max(150),
    updated: z.string(),
    distance_km: z.number().min(0),
    aqi: z.number().int().min(0).max(500).nullable(),
    pollutants: row,
  })).max(5),
});
const searchPayload = z.object({ results: z.array(row).max(20).optional() });

function airPoint(time: number, aqi: unknown, pm25: unknown, pm10: unknown): AirPoint {
  return { time, aqi: modeledAqi.safeParse(aqi).data ?? null, pm25: nonnegative(pm25), pm10: nonnegative(pm10) };
}

/** Parses and sorts Open-Meteo CAMS current snapshot and hourly bins into normalized Unix-second points. */
export function parseAir(input: unknown, now: number) {
  const { current, hourly } = body.parse(input);
  const validTime = timestamp(current?.time);
  const snapshot = validTime && current ? airPoint(validTime, current.us_aqi, current.pm2_5, current.pm10) : null;
  const bins = hourlyBins.parse(hourly ?? {});
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

function hasPm(parameter: { name: string; units: string }) {
  return ['pm25', 'pm10'].includes(parameter.name) && ['µg/m³', 'μg/m³', 'ug/m3'].includes(parameter.units);
}

const mostRecentStationTime = (entry: Station) =>
  entry.kind === 'cpcb-relay' ? entry.time : Math.max(entry.pm25?.time ?? 0, entry.pm10?.time ?? 0);

function parseSubIndex(raw: unknown): number | null {
  const result = pollutantIndex.safeParse(raw);
  return result.success ? result.data.avg : null;
}

function resolveAirState(
  airValue: { value: ReturnType<typeof parseAir>; stale: boolean },
  now: number,
): Pick<Environment, 'air' | 'airStatus'> {
  const air = airValue.value;
  const currentTime = air.current?.time;
  const future = air.hourly.some(point => point.time >= now && point.time <= now + 2 * HOUR);
  const oldCurrent = currentTime != null && (now - currentTime > 2 * HOUR || currentTime > now + 900);
  const airStatus = airValue.stale || !future || oldCurrent ? 'stale' : 'fresh';
  return { air, airStatus };
}

function resolveWeatherState(
  weather: PromiseSettledResult<{ value: Weather; stale: boolean }>,
  now: number,
): Weather | null {
  if (weather.status !== 'fulfilled' || weather.value.stale) return null;
  const { time } = weather.value.value;
  if (now - time > 2 * HOUR || time > now + 900) return null;
  return weather.value.value;
}

function resolveObservedState(
  observed: PromiseSettledResult<{
    primary: { value: Station | null; stale: boolean } | null;
    india: Environment['india'];
  }>,
  now: number,
): Pick<Environment, 'station' | 'stationStatus' | 'india'> {
  if (observed.status !== 'fulfilled' || !observed.value.primary) {
    return { station: null, stationStatus: 'unavailable' };
  }
  const { primary, india } = observed.value;
  const station = primary.value;
  if (!station) return { station: null, stationStatus: 'no-station' };
  let stationStatus: Environment['stationStatus'] = 'unavailable';
  const lastMeasurement = mostRecentStationTime(station);
  if (lastMeasurement) {
    stationStatus = !primary.stale && now - lastMeasurement <= OBSERVATION_MAX_AGE ? 'fresh' : 'stale';
  }
  return india ? { station, stationStatus, india } : { station, stationStatus };
}

const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const STATION_URL = 'https://api.openaq.org/v3/locations';
const RELAY_URL = 'https://api.dharun.dev/v1/air-quality';
const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';

type SensorSummary = { id: number; parameter: { name: string; units: string } };
type LatestRecord = z.infer<typeof latest>['results'][number];

type FeedContext = {
  request: ReturnType<typeof createTransport>;
  clock: () => number;
  providers: ReturnType<typeof createLimiter>;
  hourlyQuota: ReturnType<typeof createLimiter>;
  stationCache: ReturnType<typeof createCache<Station | null>>;
  relayCache: ReturnType<typeof createCache<IndiaStation | null>>;
};

function findLatestSensorReading(
  sensors: SensorSummary[],
  results: LatestRecord[],
  name: string,
  now: number,
) {
  const ids = new Set(
    sensors.filter(sensor => hasPm(sensor.parameter) && sensor.parameter.name === name).map(sensor => sensor.id),
  );
  const match = results
    .filter(record => ids.has(record.sensorsId) && record.value >= 0)
    .map(record => ({ value: record.value, time: Date.parse(record.datetime.utc) / 1000 }))
    .filter(record => record.time <= now + 300 && record.time >= now - 48 * HOUR)
    .sort((a, b) => b.time - a.time)[0];
  return match ? { ...match, time: Math.floor(match.time) } : null;
}

async function fetchOpenAQStation(
  ctx: FeedContext,
  lat: number,
  lon: number,
  apiKey: string,
): Promise<Station | null> {
  // At most two requests per cache miss, with no retries on the station feed.
  if (!ctx.providers('openaq', 24) || !ctx.hourlyQuota('openaq', 900)) throw new UpstreamError(429);
  const headers = { 'X-API-Key': apiKey };
  const response = await ctx.request(
    url(STATION_URL, {
      coordinates: `${lat},${lon}`,
      radius: 25000,
      limit: OPENAQ_LOCATION_LIMIT,
      iso: 'IN',
      monitor: 'true',
      mobile: 'false',
    }),
    { headers },
    0,
  );
  const lookupTime = ctx.clock();
  const known = locations.parse(response).results.flatMap(location => {
    const { distance, sensors, datetimeLast } = location;
    if (distance == null || distance > 25000 || !sensors.some(sensor => hasPm(sensor.parameter))) return [];
    // Older monitor records can be closer than the current station for the same neighbourhood.
    if (datetimeLast === null) return [];
    if (datetimeLast !== undefined) {
      const last = Date.parse(datetimeLast.utc) / 1000;
      const recent = last >= lookupTime - OBSERVATION_MAX_AGE && last <= lookupTime + 300;
      if (!recent) return [];
    }
    return [{ ...location, distance }];
  }).sort((a, b) => a.distance - b.distance);
  const nearest = known[0];
  if (!nearest) return null;
  const payload = latest.parse(
    await ctx.request(url(`${STATION_URL}/${nearest.id}/latest`, { limit: 100 }), { headers }, 0),
  );
  const now = ctx.clock();
  const pm25 = findLatestSensorReading(nearest.sensors, payload.results, 'pm25', now);
  const pm10 = findLatestSensorReading(nearest.sensors, payload.results, 'pm10', now);
  if (!pm25 && !pm10) return null;
  return {
    kind: 'openaq' as const,
    id: nearest.id,
    name: nearest.name,
    owner: nearest.owner?.name ?? nearest.provider.name,
    provider: nearest.provider.name,
    distance: nearest.distance / 1000,
    pm25,
    pm10,
  };
}

async function fetchRelayStation(ctx: FeedContext, lat: number, lon: number): Promise<IndiaStation | null> {
  if (!ctx.providers('cpcb-relay', 36)) throw new UpstreamError(429);
  const payload = relayPayload.parse(
    await ctx.request(url(RELAY_URL, { near: `${lat},${lon}` }), {}, 0),
  );
  const now = ctx.clock();
  const candidates: IndiaStation[] = [];
  for (const item of payload.data) {
    const stamp = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})(?::(\d{2}))?$/.exec(item.updated);
    if (!stamp || item.distance_km > 25) continue;
    const time = Date.parse(`${stamp[1]}T${stamp[2]}:${stamp[3] ?? '00'}+05:30`) / 1000;
    if (!Number.isFinite(time) || time > now + 300 || time < now - 48 * HOUR) continue;
    const pm25Index = parseSubIndex(item.pollutants['PM2.5']);
    const pm10Index = parseSubIndex(item.pollutants.PM10);
    if (pm25Index == null && pm10Index == null) continue;
    candidates.push({
      kind: 'cpcb-relay',
      name: item.station,
      owner: 'CPCB monitoring network',
      provider: 'India API / data.gov.in',
      distance: item.distance_km,
      aqi: item.aqi,
      time,
      pm25Index,
      pm10Index,
    });
  }
  return candidates.sort((a, b) => Number(now - a.time > OBSERVATION_MAX_AGE)
    - Number(now - b.time > OBSERVATION_MAX_AGE) || a.distance - b.distance)[0] ?? null;
}

async function fetchObservations(
  ctx: FeedContext,
  key: string,
  lat: number,
  lon: number,
  openaqApiKey: string | undefined,
) {
  const [openAQ, relay] = await Promise.all([
    openaqApiKey ? ctx.stationCache(key, () => fetchOpenAQStation(ctx, lat, lon, openaqApiKey)).catch(() => null) : null,
    ctx.relayCache(key, () => fetchRelayStation(ctx, lat, lon)).catch(() => null),
  ]);
  const now = ctx.clock();
  const isFresh = (entry: { value: Station | null; stale: boolean } | null) =>
    entry?.value != null && !entry.stale && now - mostRecentStationTime(entry.value) <= OBSERVATION_MAX_AGE;
  const primary = isFresh(openAQ) ? openAQ
    : relay?.value ? relay : openAQ?.value ? openAQ : relay;
  const india: Environment['india'] = relay?.value && primary?.value?.kind === 'openaq'
    ? { station: relay.value, status: isFresh(relay) ? 'fresh' : 'stale' }
    : undefined;
  return { primary, india };
}

/** Creates cached, rate-limited city search and multi-provider environment fetchers. */
export function createEnvironment(fetcher: Fetcher, clock: () => number) {
  const request = createTransport(fetcher);
  const airCache = createCache<ReturnType<typeof parseAir>>(384, 480, 3 * HOUR, clock);
  const weatherCache = createCache<Weather>(384, 720, 2 * HOUR, clock);
  const searchCache = createCache<City[]>(384, 3600, 86400, clock);
  const providers = createLimiter(clock);
  const ctx: FeedContext = {
    request,
    clock,
    providers,
    hourlyQuota: createLimiter(clock, HOUR),
    stationCache: createCache<Station | null>(384, 900, 12 * HOUR, clock),
    relayCache: createCache<IndiaStation | null>(384, 600, 12 * HOUR, clock),
  };

  return {
    async search(query: string): Promise<City[]> {
      const key = query.toLowerCase();
      const cached = await searchCache(key, async () => {
        if (!providers('search', 24)) throw new UpstreamError(429);
        const response = await request(
          url(GEOCODE_URL, { name: query, count: 8, countryCode: 'IN', language: 'en' }),
        );
        const seen = new Set<string>();
        return (searchPayload.parse(response).results ?? []).flatMap(entry => {
          if (entry.country_code !== 'IN') return [];
          const city = citySchema.safeParse({
            name: entry.name,
            state: entry.admin1 ?? '',
            lat: entry.latitude,
            lon: entry.longitude,
          });
          if (!city.success) return [];
          const label = `${city.data.name.toLowerCase()}|${city.data.state.toLowerCase()}`;
          if (seen.has(label)) return [];
          seen.add(label);
          return [city.data];
        });
      });
      return cached.value;
    },
    async get(coords: { lat: number; lon: number }, openaqApiKey?: string): Promise<Environment> {
      const lat = Number(coords.lat.toFixed(2));
      const lon = Number(coords.lon.toFixed(2));
      const key = `${lat},${lon}`;
      const base = { latitude: lat, longitude: lon, timezone: TIMEZONE, timeformat: 'unixtime' };
      const [air, weather, observed] = await Promise.allSettled([
        airCache(key, async () => {
          if (!providers('model', 45)) throw new UpstreamError(429);
          return parseAir(await request(url(AIR_URL, {
            ...base, current: 'us_aqi,pm2_5,pm10', hourly: 'us_aqi,pm2_5,pm10', forecast_days: 3,
          })), clock());
        }),
        weatherCache(key, async () => {
          if (!providers('weather', 45)) throw new UpstreamError(429);
          const { current } = body.parse(await request(url(WEATHER_URL, {
            ...base, current: 'temperature_2m,relative_humidity_2m,wind_speed_10m', forecast_days: 1,
          })));
          const time = timestamp(current?.time);
          if (!current || time == null) throw new UpstreamError(502);
          return {
            time,
            temperature: number(current.temperature_2m),
            humidity: nonnegative(current.relative_humidity_2m),
            wind: nonnegative(current.wind_speed_10m),
          };
        }),
        fetchObservations(ctx, key, lat, lon, openaqApiKey),
      ]);
      const now = clock();
      const out = { ...EMPTY_ENV };
      if (air.status === 'fulfilled') Object.assign(out, resolveAirState(air.value, now));
      out.weather = resolveWeatherState(weather, now);
      Object.assign(out, resolveObservedState(observed, now));
      return out;
    },
  };
}
