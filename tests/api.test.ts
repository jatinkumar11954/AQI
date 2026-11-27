import { expect, it, vi } from 'vitest';
import { createApp } from '../src/server/app';
import { createCache, createTransport } from '../src/shared/upstream';
import { DEFAULT_PROFILE, HOUR } from '../src/shared/model';
import { NOW, providerAir, relayPayload } from './fixtures';

const coords = { lat: 28.61, lon: 77.21 };
const envPath = '/api/environment?lat=28.61&lon=77.21';
const question = { location: coords, profile: DEFAULT_PROFILE, question: 'Can I open windows?' };
const post = (data: unknown, headers: Record<string, string> = {}) => ({
  method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(data),
});
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
const baseFeed = (target: URL, now = NOW) => {
  if (target.hostname === 'air-quality-api.open-meteo.com') return json(providerAir(now));
  if (target.host === 'api.open-meteo.com') return json({ current: { time: now, temperature_2m: 22 } });
  if (target.host === 'api.dharun.dev') return json(relayPayload());
  return json({}, 404);
};

it('validates location, text size, content type and same-origin writes', async () => {
  const fetcher = vi.fn(async () => json({}));
  const app = createApp({ fetcher });
  for (const url of ['/api/environment?lat=0&lon=77', '/api/environment?lat=28&lon=\u221e', '/api/places?q=x']) {
    expect((await app.request(url)).status).toBe(400);
  }
  expect((await app.request('/api/ask', post(question, { origin: 'https://unrelated.test' }))).status).toBe(403);
  expect((await app.request('/api/ask', post(question, { 'content-type': 'text/plain' }))).status).toBe(415);
  expect((await app.request('/api/ask', post({ ...question, question: 'x'.repeat(5000) }))).status).toBe(413);
  expect((await app.request('/api/ask', post({ ...question, question: 'x'.repeat(351) }))).status).toBe(400);
  expect(fetcher).not.toHaveBeenCalled();
});

it('coalesces the three feeds and preserves station sub-index provenance', async () => {
  const fetcher = vi.fn(async target => baseFeed(target));
  const app = createApp({ fetcher, clock: () => NOW });
  const [left, right] = await Promise.all([app.request(envPath), app.request(envPath)]);
  expect(left.headers.get('cache-control')).toBe('no-store');
  expect(left.headers.get('x-content-type-options')).toBe('nosniff');
  expect(await left.json()).toMatchObject({ airStatus: 'fresh', stationStatus: 'fresh', station: { kind: 'cpcb-relay', aqi: 123, pm25Index: 123 }, weather: { temperature: 22, humidity: null } });
  expect(await right.json()).toMatchObject({ airStatus: 'fresh' });
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('reads OpenAQ mass sensors by ID, rejects unknown and future values', async () => {
  const utc = new Date((NOW - 900) * 1000).toISOString();
  const fetcher = vi.fn(async (target: URL, init?: RequestInit) => {
    if (target.hostname !== 'api.openaq.org') return baseFeed(target);
    expect(new Headers(init?.headers).get('X-API-Key')).toBe('test-key');
    if (target.pathname.endsWith('/latest')) return json({ results: [
      { sensorsId: 62, value: 81, datetime: { utc } },
      { sensorsId: 65, value: 912, datetime: { utc } },
      { sensorsId: 61, value: 163, datetime: { utc: new Date((NOW + HOUR) * 1000).toISOString() } },
    ] });
    expect(target.searchParams.get('monitor')).toBe('true');
    return json({ results: [{
      id: 8, name: 'Test', distance: 200, provider: { name: 'CPCB' },
      sensors: [{ id: 62, parameter: { name: 'pm25', units: 'µg/m³' } }, { id: 61, parameter: { name: 'pm10', units: 'µg/m³' } }],
    }] });
  });
  const app = createApp({ fetcher, clock: () => NOW });
  const reply = await (await app.request(envPath, undefined, { OPENAQ_API_KEY: 'test-key' })).json();
  expect(reply.station).toMatchObject({ kind: 'openaq', id: 8, pm25: { value: 81 }, pm10: null });
  expect(reply.india).toMatchObject({ status: 'fresh', station: { kind: 'cpcb-relay', aqi: 123 } });
  expect(fetcher.mock.calls.some(([target]) => target.hostname === 'api.dharun.dev')).toBe(true);
});

it('uses the relay when OpenAQ rejects credentials and marks old values stale', async () => {
  const fetcher = vi.fn(async target => target.hostname === 'api.openaq.org' ? json({}, 401) : baseFeed(target, NOW + 4 * HOUR));
  const app = createApp({ fetcher, clock: () => NOW + 4 * HOUR });
  const reply = await (await app.request(envPath, undefined, { OPENAQ_API_KEY: 'invalid-key' })).json();
  expect(reply).toMatchObject({ airStatus: 'fresh', stationStatus: 'stale', station: { kind: 'cpcb-relay' } });
});

it('returns stale cached air during outage and null after its maximum age', async () => {
  let stamp = NOW;
  let down = false;
  const fetcher = vi.fn(async target => target.hostname === 'air-quality-api.open-meteo.com' && down ? json({}, 503) : baseFeed(target, stamp));
  const app = createApp({ fetcher, clock: () => stamp });
  await app.request(envPath);
  stamp += 600; down = true;
  expect(await (await app.request(envPath)).json()).toMatchObject({ airStatus: 'stale' });
  stamp += 3 * HOUR;
  expect(await (await app.request(envPath)).json()).toMatchObject({ airStatus: 'unavailable', air: null });
  expect(fetcher.mock.calls.filter(([target]) => target.hostname === 'air-quality-api.open-meteo.com')).toHaveLength(5);
});

it('filters geocoding to Indian results, deduplicates identical labels, and returns an empty list', async () => {
  const fetcher = vi.fn(async target => json({ results: target.searchParams.get('name') === 'Mumbai' ? [
    { name: 'Mumbai', admin1: 'Maharashtra', latitude: 19.08, longitude: 72.88, country_code: 'IN' },
    { name: 'Mumbai', admin1: 'Maharashtra', latitude: 19.09, longitude: 72.89, country_code: 'IN' },
    { name: 'Dubai', latitude: 25.2, longitude: 55.3, country_code: 'AE' },
  ] : [] }));
  const app = createApp({ fetcher });
  expect(await (await app.request('/api/places?q=Mumbai')).json()).toEqual({ places: [{ name: 'Mumbai', state: 'Maharashtra', lat: 19.08, lon: 72.88 }] });
  expect(await (await app.request('/api/places?q=Noplace')).json()).toEqual({ places: [] });
});

it('keeps cached city results available when the shared geocoder budget is exhausted', async () => {
  const fetcher = vi.fn(async () => json({ results: [] }));
  const app = createApp({ fetcher, clock: () => NOW });
  for (let index = 0; index < 24; index++) {
    expect((await app.request('/api/places?q=Area' + index)).status).toBe(200);
  }
  const uncached = await app.request('/api/places?q=Area24');
  expect(uncached.status).toBe(503);
  expect(uncached.headers.get('Retry-After')).toBe('60');
  expect(await uncached.json()).toMatchObject({ error: { code: 'UPSTREAM_LIMIT' } });
  expect(await (await app.request('/api/places?q=area0')).json()).toEqual({ places: [] });
  expect(fetcher).toHaveBeenCalledTimes(24);
});

it('skips OpenAQ monitors whose PM sensors have no recent readings and falls back to CPCB relay', async () => {
  const freshUtc = new Date((NOW - 900) * 1000).toISOString();
  const staleUtc = new Date((NOW - 60 * HOUR) * 1000).toISOString();
  const fetcher = vi.fn(async (target: URL) => {
    if (target.hostname !== 'api.openaq.org') return baseFeed(target);
    if (target.pathname.endsWith('/latest')) {
      return json({ results: [{ sensorsId: 62, value: 40, datetime: { utc: staleUtc } }] });
    }
    return json({ results: [{
      id: 8, name: 'Test', distance: 200, provider: { name: 'CPCB' }, datetimeLast: { utc: freshUtc },
      sensors: [{ id: 62, parameter: { name: 'pm25', units: 'µg/m³' } }],
    }] });
  });
  const app = createApp({ fetcher, clock: () => NOW });
  const reply = await (await app.request(envPath, undefined, { OPENAQ_API_KEY: 'test-key' })).json();
  expect(reply).toMatchObject({ stationStatus: 'fresh', station: { kind: 'cpcb-relay', aqi: 123 } });
});

it('sends grounded context to Gemini with a server-only key and renders approved text', async () => {
  const fetcher = vi.fn(async (target: URL, init?: RequestInit) => {
    if (target.host !== 'generativelanguage.googleapis.com') return baseFeed(target);
    expect(new Headers(init?.headers).get('x-goog-api-key')).toBe('server-only');
    expect(target.search).toBe('');
    expect(target.pathname).toContain('/gemini-custom:generateContent');
    expect(init?.body).toContain('stationCaution');
    return json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"topic":"ventilation"}' }] } }] });
  });
  const response = await createApp({ fetcher, clock: () => NOW }).request('/api/ask', post(question), { GEMINI_API_KEY: 'server-only', GEMINI_MODEL: 'gemini-custom' });
  const answer = await response.text();
  expect(answer).toContain('"mode":"gemini"');
  expect(answer).toContain('window opening');
  expect(answer).not.toContain('server-only');
});

it.each([[429, 'quota'], [503, 'unavailable'], [200, 'unavailable']])('keeps grounded answers when Gemini returns %s', async (status, reason) => {
  const fetcher = vi.fn(async target => target.host === 'generativelanguage.googleapis.com'
    ? json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"topic":"unsafe","text":"invented claim"}' }] } }] }, status)
    : baseFeed(target));
  const result = await createApp({ fetcher, clock: () => NOW }).request('/api/ask', post(question), { GEMINI_API_KEY: 'test' });
  expect(await result.json()).toMatchObject({ mode: 'rules', status: reason, sources: ['clean'] });
});

it('labels keyless answers and rate-limits repeated questions', async () => {
  const app = createApp({ fetcher: async target => baseFeed(target as URL), clock: () => NOW });
  for (let count = 0; count < 5; count++) {
    expect(await (await app.request('/api/ask', post(question))).json()).toMatchObject({ mode: 'rules', status: 'unconfigured' });
  }
  const limited = await app.request('/api/ask', post(question));
  expect(limited.status).toBe(429);
  expect(limited.headers.get('Retry-After')).toBe('60');
});

it('bounds in-flight cache lookups and expires stale copies', async () => {
  let now = 0;
  const get = createCache<string>(1, 10, 30, () => now);
  const fill = vi.fn(async () => 'sample');
  await Promise.all([get('spot', fill), get('spot', fill)]);
  expect(fill).toHaveBeenCalledTimes(1);
  now = 15;
  const fail = async () => { throw new Error('upstream'); };
  expect(await get('spot', fail)).toEqual({ stale: true, value: 'sample' });
  now = 31;
  await expect(get('spot', fail)).rejects.toThrow('upstream');
});

it('evicts the oldest cache entry when a new location exceeds capacity', async () => {
  const get = createCache<string>(2, 10, 30, () => NOW);
  await get('first', async () => 'first data');
  await get('second', async () => 'second data');
  await get('third', async () => 'third data');
  const reload = vi.fn(async () => 'current data');
  await expect(get('second', reload)).resolves.toEqual({ value: 'second data', stale: false });
  await expect(get('first', reload)).resolves.toEqual({ value: 'current data', stale: false });
  expect(reload).toHaveBeenCalledTimes(1);
});

it('drops oversized streamed upstream bodies without retrying them', async () => {
  const buffer = 'x'.repeat(256 * 1024 + 1);
  const fetcher = vi.fn(async () => new Response(buffer));
  const request = createTransport(fetcher);
  await expect(request(new URL('https://example.test/'))).rejects.toMatchObject({ status: 422 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('invokes the default runtime fetch with its global receiver', async () => {
  const runtimeFetch = vi.fn(async function (this: typeof globalThis, target: URL) {
    if (this !== globalThis) throw new TypeError('Wrong fetch receiver');
    return baseFeed(target);
  });
  vi.stubGlobal('fetch', runtimeFetch);
  try {
    const response = await createApp({ clock: () => NOW }).request(envPath);
    expect(await response.json()).toMatchObject({ airStatus: 'fresh', stationStatus: 'fresh' });
    expect(runtimeFetch).toHaveBeenCalledTimes(3);
  } finally {
    vi.unstubAllGlobals();
  }
});

it('allows the configured Pages origin and rejects cross-origin requests from other sites', async () => {
  const origin = 'https://project-owner.github.io';
  const runtime = { SAANS_PUBLIC_ORIGIN: origin };
  const app = createApp({ fetcher: async target => baseFeed(target), clock: () => NOW });
  const preflight = (caller: string) => app.request('/api/ask', {
    method: 'OPTIONS',
    headers: { origin: caller, 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' },
  }, runtime);
  const allowed = await preflight(origin);
  expect(allowed.status).toBe(204);
  expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(origin);
  expect(allowed.headers.get('Access-Control-Allow-Headers')).toBe('Content-Type');
  expect((await preflight('https://other.github.io')).status).toBe(403);
  const bad = await app.request('/api/ask', post(question, { origin: 'https://other.github.io' }), runtime);
  expect(bad.status).toBe(403);
  expect(bad.headers.get('Access-Control-Allow-Origin')).toBeNull();
  const response = await app.request('/api/ask', post(question, { origin }), runtime);
  expect(response.status).toBe(200);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
});

it('accepts the local Vite origin only when explicitly configured by the dev server', async () => {
  const origin = 'http://127.0.0.1:4173';
  const fetcher = async (target: URL) => baseFeed(target);
  const url = 'http://127.0.0.1:4174/api/ask';
  const dev = createApp({ fetcher, clock: () => NOW, developmentOrigin: origin });
  const production = createApp({ fetcher, clock: () => NOW });
  expect((await dev.request(url, post(question, { origin }))).status).toBe(200);
  expect((await dev.request(url, post(question, { origin: 'http://127.0.0.1:4200' }))).status).toBe(403);
  expect((await production.request(url, post(question, { origin }))).status).toBe(403);
});

it('accepts the Render service origin behind TLS termination without opening CORS', async () => {
  const origin = 'https://service.onrender.com';
  const url = 'http://service.onrender.com/api/ask';
  const app = createApp({ fetcher: async target => baseFeed(target), clock: () => NOW, publicServiceOrigin: origin });
  const response = await app.request(url, post(question, { origin }));
  expect(response.status).toBe(200);
  expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();
  expect((await app.request(url, post(question, { origin: 'https://other.onrender.com' }))).status).toBe(403);
});

it('prefers an active OpenAQ monitor over a closer inactive record', async () => {
  const latest = new Date((NOW - HOUR) * 1000).toISOString();
  const old = new Date((NOW - 365 * 24 * HOUR) * 1000).toISOString();
  const template = {
    name: 'Test monitor', provider: { name: 'Test' },
    sensors: [{ id: 34, parameter: { name: 'pm25', units: 'µg/m³' } }],
  };
  const fetcher = vi.fn(async (target: URL) => {
    if (target.hostname !== 'api.openaq.org') return baseFeed(target);
    if (target.pathname.endsWith('/latest')) {
      expect(target.pathname).toBe('/v3/locations/2/latest');
      return json({ results: [{ sensorsId: 34, value: 42.5, datetime: { utc: latest } }] });
    }
    return json({ results: [
      { ...template, id: 1, distance: 800, datetimeLast: { utc: old } },
      { ...template, id: 2, distance: 1800, datetimeLast: { utc: latest } },
    ] });
  });
  const app = createApp({ fetcher, clock: () => NOW });
  const response = await app.request(envPath, undefined, { OPENAQ_API_KEY: 'test-key' });
  expect(await response.json()).toMatchObject({ stationStatus: 'fresh', station: { kind: 'openaq', id: 2, pm25: { value: 42.5 } } });
});

it('keeps readiness independent of providers and reports invalid public origin configuration', async () => {
  const fetcher = vi.fn(async () => json({}, 503));
  const app = createApp({ fetcher });
  expect(await (await app.request('/api/health')).json()).toEqual({ status: 'ok' });
  const ready = await app.request('/api/ready', undefined, { SAANS_PUBLIC_ORIGIN: 'https://example.github.io' });
  expect(ready.status).toBe(200);
  expect(await ready.json()).toEqual({ status: 'ready' });
  const invalid = await app.request('/api/ready', undefined, { SAANS_PUBLIC_ORIGIN: 'https://example.github.io/AQI/' });
  expect(invalid.status).toBe(503);
  expect(await invalid.json()).toEqual({ status: 'not_ready' });
  expect(fetcher).not.toHaveBeenCalled();
});

it('coalesces a burst of independent clients using the same city', async () => {
  const fetcher = vi.fn(async target => baseFeed(target));
  const app = createApp({ fetcher, clock: () => NOW });
  const results = await Promise.all(Array.from({ length: 25 }, (_unused, i) =>
    app.request(envPath, undefined, { clientAddress: 'client-' + i }),
  ));
  for (const response of results) {
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ airStatus: 'fresh', stationStatus: 'fresh' });
  }
  expect(fetcher).toHaveBeenCalledTimes(3);
});

it('rejects oversized Content-Length upstream responses and drops out-of-window OpenAQ readings', async () => {
  const oversizedFetcher = vi.fn(async () => new Response('ok', { status: 200, headers: { 'Content-Length': String(300 * 1024) } }));
  const oversizedApp = createApp({ fetcher: oversizedFetcher, clock: () => NOW });
  expect((await oversizedApp.request('/api/places?q=Pune')).status).toBe(503);
  expect(oversizedFetcher).toHaveBeenCalledTimes(1);

  const staleSensorFetcher = vi.fn(async (target: URL) => {
    if (target.pathname === '/v3/locations') {
      return json({
        results: [
          {
            id: 10, name: 'Null Last Station', distance: 500, provider: { name: 'CPCB' },
            datetimeLast: null, sensors: [{ id: 1, parameter: { name: 'pm25', units: 'µg/m³' } }],
          },
          {
            id: 11, name: 'Old Reading Station', distance: 1200, provider: { name: 'CPCB' },
            datetimeLast: { utc: new Date((NOW - 300) * 1000).toISOString() },
            sensors: [{ id: 2, parameter: { name: 'pm25', units: 'µg/m³' } }],
          },
        ],
      });
    }
    if (target.pathname === '/v3/locations/11/latest') {
      return json({
        results: [
          { sensorsId: 2, value: 40, datetime: { utc: new Date((NOW - 72 * HOUR) * 1000).toISOString() } },
        ],
      });
    }
    if (target.hostname === 'api.dharun.dev') return json({ data: [] });
    return baseFeed(target);
  });
  const app = createApp({ fetcher: staleSensorFetcher, clock: () => NOW });
  const body = await (await app.request(envPath, undefined, { OPENAQ_API_KEY: 'test-key' })).json();
  expect(body).toMatchObject({ stationStatus: 'no-station', station: null });
});

it('serves stale cached entries when in-flight fan-out reaches the concurrency cap', async () => {
  const { createCache } = await import('../src/shared/upstream');
  let now = 1000;
  const cache = createCache<string>(32, 10, 100, () => now);
  await cache('seeded', async () => 'cached-val');
  now = 1020; // expired TTL (10s) but within staleTtl (100s)
  let release!: () => void;
  const barrier = new Promise<void>(resolve => { release = resolve; });
  const pending = Array.from({ length: 16 }, (_, i) => cache('k' + i, async () => { await barrier; return 'v' + i; }));
  await expect(cache('seeded', async () => 'fresh')).resolves.toEqual({ value: 'cached-val', stale: true });
  await expect(cache('overflow', async () => 'fresh')).rejects.toMatchObject({ status: 503 });
  release();
  await Promise.all(pending);
});
