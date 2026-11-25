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
  expect(fetcher.mock.calls.some(([target]) => target.hostname === 'api.dharun.dev')).toBe(false);
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

it('filters geocoding to Indian results and returns an explicit empty list', async () => {
  const fetcher = vi.fn(async target => json({ results: target.searchParams.get('name') === 'Mumbai' ? [
    { name: 'Mumbai', admin1: 'Maharashtra', latitude: 19.08, longitude: 72.88, country_code: 'IN' },
    { name: 'Dubai', latitude: 25.2, longitude: 55.3, country_code: 'AE' },
  ] : [] }));
  const app = createApp({ fetcher });
  expect(await (await app.request('/api/places?q=Mumbai')).json()).toMatchObject({ places: [{ name: 'Mumbai' }] });
  expect(await (await app.request('/api/places?q=Noplace')).json()).toEqual({ places: [] });
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
