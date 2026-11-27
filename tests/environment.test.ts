import { expect, it, vi } from 'vitest';
import { createEnvironment, parseAir } from '../src/shared/environment';
import { HOUR } from '../src/shared/model';
import { NOW, providerAir, relayPayload } from './fixtures';

const location = { lat: 28.61, lon: 77.21 };

function feed(target: URL, now = NOW): Response {
  switch (target.hostname) {
    case 'air-quality-api.open-meteo.com': return Response.json(providerAir(now));
    case 'api.open-meteo.com': return Response.json({ current: { time: now, temperature_2m: 22 } });
    case 'api.dharun.dev': return Response.json(relayPayload());
    default: return new Response(null, { status: 404 });
  }
}

it('sorts usable forecast bins, keeps the latest value for a duplicate hour, and preserves missing metrics', () => {
  const later = NOW + 2 * HOUR;
  const earlier = NOW + HOUR;
  expect(parseAir({
    current: { time: 'missing', us_aqi: 80 },
    hourly: { time: [later, 'invalid', earlier, later], us_aqi: [15, 85, -1, 45], pm2_5: [5, 15, -3, 12] },
  }, NOW)).toEqual({
    current: null,
    hourly: [
      { time: earlier, aqi: null, pm25: null, pm10: null },
      { time: later, aqi: 45, pm25: 12, pm10: null },
    ],
    fetchedAt: NOW,
  });
});

it('accepts a current-only CAMS payload and rejects a payload with no usable times', () => {
  expect(parseAir({ current: { time: NOW, us_aqi: 80 } }, NOW)).toMatchObject({ current: { aqi: 80 }, hourly: [] });
  expect(() => parseAir({ hourly: { time: ['invalid'] } }, NOW)).toThrow('Upstream request failed');
});

it.each([
  { current: { time: 'invalid', temperature_2m: 22 } },
  { current: { time: NOW, temperature_2m: 'unknown', relative_humidity_2m: 54 } },
])('isolates invalid weather fields from the AQI and station feeds (%j)', async payload => {
  const fetcher = vi.fn(async (target: URL) => target.hostname === 'api.open-meteo.com'
    ? Response.json(payload) : feed(target));
  const environment = createEnvironment(fetcher, () => NOW);
  const weather = payload.current.time === NOW ? { time: NOW, temperature: null, humidity: 54, wind: null } : null;
  await expect(environment.get(location)).resolves.toMatchObject({ airStatus: 'fresh', stationStatus: 'fresh', weather });
});

it('skips OpenAQ locations with missing distance, outside the radius, or with incompatible sensor units', async () => {
  const monitor = { name: 'Monitor', provider: { name: 'OpenAQ' } };
  const pm = [{ id: 1, parameter: { name: 'pm25', units: 'µg/m³' } }];
  const fetcher = vi.fn(async (target: URL) => target.pathname === '/v3/locations'
    ? Response.json({ results: [
      { ...monitor, id: 1, distance: null, sensors: pm },
      { ...monitor, id: 2, distance: 25_001, sensors: pm },
      { ...monitor, id: 3, distance: 100, sensors: [{ id: 3, parameter: { name: 'pm25', units: 'ppm' } }] },
    ] }) : feed(target));
  const environment = createEnvironment(fetcher, () => NOW);
  await expect(environment.get(location, 'fixture-key')).resolves.toMatchObject({
    stationStatus: 'fresh', station: { kind: 'cpcb-relay', aqi: 123 },
  });
  expect(fetcher.mock.calls.filter(([target]) => target.hostname === 'api.openaq.org').map(([target]) => target.pathname))
    .toEqual(['/v3/locations']);
});

it('keeps a PM10-only OpenAQ observation during an outage and labels the older relay independently', async () => {
  let now = NOW;
  const utc = new Date(NOW * 1000).toISOString();
  const [relay] = relayPayload().data;
  const fetcher = vi.fn(async (target: URL) => {
    if (target.hostname === 'api.dharun.dev') {
      return Response.json({ data: now === NOW ? [{ ...relay, updated: '2026-11-26 02:00' }] : [] });
    }
    if (target.hostname !== 'api.openaq.org') return feed(target, now);
    if (now > NOW) return new Response(null, { status: 503 });
    if (target.pathname.endsWith('/latest')) return Response.json({ results: [{ sensorsId: 1, value: 165, datetime: { utc } }] });
    return Response.json({ results: [{
      id: 1, name: 'PM10 monitor', distance: 100, provider: { name: 'OpenAQ' },
      sensors: [{ id: 1, parameter: { name: 'pm10', units: 'µg/m³' } }],
    }] });
  });
  const environment = createEnvironment(fetcher, () => now);
  const station = { kind: 'openaq', pm25: null, pm10: { value: 165, time: NOW } };
  await expect(environment.get(location, 'fixture-key')).resolves.toMatchObject({
    stationStatus: 'fresh', station, india: { status: 'stale', station: { kind: 'cpcb-relay' } },
  });
  now += 4 * HOUR;
  const outage = await environment.get(location, 'fixture-key');
  expect(outage).toMatchObject({ airStatus: 'fresh', stationStatus: 'stale', station });
  expect(outage.india).toBeUndefined();
});

it('ignores unusable relay stations and prefers a fresh observation to a closer stale one', async () => {
  const [station] = relayPayload().data;
  const fetcher = vi.fn(async (target: URL) => target.hostname === 'api.dharun.dev'
    ? Response.json({ data: [
      { ...station, station: 'Out of range', distance_km: 26 },
      { ...station, station: 'Future station', distance_km: 0.1, updated: '2026-11-26 08:00' },
      { ...station, station: 'No particle readings', distance_km: 0.2, pollutants: { PM10: { avg: 510 } } },
      { ...station, station: 'Closer stale station', distance_km: 0.5, updated: '2026-11-26 02:00' },
      { ...station, station: 'Fresh PM10 station', distance_km: 4, aqi: null, pollutants: { PM10: { avg: 112 } } },
    ] }) : feed(target));
  await expect(createEnvironment(fetcher, () => NOW).get(location)).resolves.toMatchObject({
    stationStatus: 'fresh', station: { name: 'Fresh PM10 station', aqi: null, pm25Index: null, pm10Index: 112 },
  });
});

it('selects the nearest relay station when both observations are fresh', async () => {
  const [station] = relayPayload().data;
  const fetcher = vi.fn(async (target: URL) => target.hostname === 'api.dharun.dev'
    ? Response.json({ data: [
      { ...station, station: 'Farther station', distance_km: 8, updated: '2026-11-26 06:20' },
      { ...station, station: 'Nearer station', distance_km: 3 },
    ] }) : feed(target));
  await expect(createEnvironment(fetcher, () => NOW).get(location)).resolves.toMatchObject({
    stationStatus: 'fresh', station: { name: 'Nearer station', distance: 3 },
  });
});

it('keeps geocoding results with no state, drops invalid coordinates, and handles an omitted results list', async () => {
  const fetcher = vi.fn(async (target: URL) => Response.json(target.searchParams.get('name') === 'Pune'
    ? { results: [
      { name: 'Pune', latitude: 18.52, longitude: 73.86, country_code: 'IN' },
      { name: 'Invalid', latitude: 90, longitude: 73.86, country_code: 'IN' },
    ] } : {}));
  const environment = createEnvironment(fetcher, () => NOW);
  await expect(environment.search('Pune')).resolves.toEqual([{ name: 'Pune', state: '', lat: 18.52, lon: 73.86 }]);
  await expect(environment.search('Nowhere')).resolves.toEqual([]);
});

it('enforces per-provider limits for uncached cities and still serves cached readings', async () => {
  const fetcher = vi.fn(async (target: URL) => target.hostname === 'api.openaq.org'
    ? Response.json({ results: [] }) : feed(target));
  const environment = createEnvironment(fetcher, () => NOW);
  let out;
  for (let index = 0; index < 46; index++) {
    out = await environment.get({ ...location, lat: location.lat + index / 100 }, 'fixture-key');
  }
  expect(out).toMatchObject({ airStatus: 'unavailable', stationStatus: 'unavailable', weather: null });
  await expect(environment.get(location, 'fixture-key')).resolves.toMatchObject({
    airStatus: 'fresh', stationStatus: 'fresh', weather: { temperature: 22 },
  });
  const calls = fetcher.mock.calls.map(([target]) => target.hostname);
  expect(calls.filter(host => host === 'api.openaq.org')).toHaveLength(24);
  expect(calls.filter(host => host === 'api.dharun.dev')).toHaveLength(36);
  expect(calls.filter(host => host === 'air-quality-api.open-meteo.com')).toHaveLength(45);
  expect(calls.filter(host => host === 'api.open-meteo.com')).toHaveLength(45);
});
