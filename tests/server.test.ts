import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server/app';
import { HOUR } from '../src/shared/model';
import worker from '../src/server/worker';
import vercelHandler from '../api/index';
import { staticAsset } from '../src/server/worker-assets.mjs';

const NOW = 1795631400;

function makeMockFetcher({
  weatherFails = false,
  openaqStatus = 200,
  relayStatus = 404,
}: { weatherFails?: boolean; openaqStatus?: number; relayStatus?: number } = {}) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const href = String(input);
    if (href.includes('geocoding-api.open-meteo.com')) {
      return new Response(JSON.stringify({
        results: [
          { name: 'Pune', admin1: 'Maharashtra', country_code: 'IN', latitude: 18.52, longitude: 73.86 },
          { name: 'Pune-Foreign', admin1: 'Other', country_code: 'US', latitude: 40.0, longitude: -70.0 },
        ],
      }), { status: 200 });
    }
    if (href.includes('air-quality-api.open-meteo.com')) {
      return new Response(JSON.stringify({
        current: { time: NOW, us_aqi: 92, pm2_5: 29.4, pm10: 54.1 },
        hourly: {
          time: [NOW, NOW + HOUR, NOW + 2 * HOUR],
          us_aqi: [92, 85, 78],
          pm2_5: [29.4, 26.2, 23.1],
          pm10: [54.1, 48.0, 44.0],
        },
      }), { status: 200 });
    }
    if (href.includes('api.open-meteo.com/v1/forecast')) {
      if (weatherFails) return new Response('unavailable', { status: 503 });
      return new Response(JSON.stringify({
        current: { time: NOW, temperature_2m: 25.3, relative_humidity_2m: 52, wind_speed_10m: 9.4 },
      }), { status: 200 });
    }
    if (href.includes('api.openaq.org/v3/locations/777/latest')) {
      return new Response(JSON.stringify({
        results: [
          { sensorsId: 10, value: 33.5, datetime: { utc: new Date((NOW - 1200) * 1000).toISOString() } },
          { sensorsId: 11, value: 78.2, datetime: { utc: new Date((NOW - 1200) * 1000).toISOString() } },
        ],
      }), { status: 200 });
    }
    if (href.includes('api.openaq.org/v3/locations')) {
      if (openaqStatus !== 200) return new Response('unauthorized', { status: openaqStatus });
      return new Response(JSON.stringify({
        results: [
          {
            id: 777,
            name: 'Shivajinagar Station',
            distance: 3100,
            owner: { name: 'MPCB' },
            provider: { name: 'CPCB' },
            sensors: [
              { id: 10, parameter: { name: 'pm25', units: 'µg/m³' } },
              { id: 11, parameter: { name: 'pm10', units: 'µg/m³' } },
            ],
          },
        ],
      }), { status: 200 });
    }
    if (href.includes('api.dharun.dev/v1/air-quality')) {
      if (relayStatus !== 200) return new Response('unavailable', { status: relayStatus });
      return new Response(JSON.stringify({
        data: [
          {
            station: 'Karve Road, Pune',
            updated: '2026-11-25 23:45:00',
            distance_km: 2.4,
            aqi: 118,
            pollutants: { 'PM2.5': { avg: 118 }, PM10: { avg: 94 } },
          },
        ],
      }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  });
}

describe('HTTP API contract and error boundaries', () => {
  it('returns health status with no-store and security headers', async () => {
    const app = createApp({ fetcher: makeMockFetcher() as unknown as typeof fetch, clock: () => NOW });
    const response = await app.fetch(new Request('http://localhost/api/health'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('validates search queries and returns only Indian places', async () => {
    const app = createApp({ fetcher: makeMockFetcher() as unknown as typeof fetch, clock: () => NOW });
    const bad = await app.fetch(new Request('http://localhost/api/places?q=a'));
    expect(bad.status).toBe(400);

    const good = await app.fetch(new Request('http://localhost/api/places?q=Pune'));
    expect(good.status).toBe(200);
    const data = await good.json() as { places: { name: string }[] };
    expect(data.places).toHaveLength(1);
    expect(data.places[0].name).toBe('Pune');
  });

  it('handles partial upstream failures, OpenAQ stations, and CPCB relay fallback', async () => {
    const partialApp = createApp({
      fetcher: makeMockFetcher({ weatherFails: true, openaqStatus: 401, relayStatus: 503 }) as unknown as typeof fetch,
      clock: () => NOW,
    });
    const invalidCoord = await partialApp.fetch(new Request('http://localhost/api/environment?lat=51.5&lon=-0.1'));
    expect(invalidCoord.status).toBe(400);

    const partialRes = await partialApp.fetch(new Request('http://localhost/api/environment?lat=18.52&lon=73.86'), {
      OPENAQ_API_KEY: 'bad-key',
    });
    expect(partialRes.status).toBe(200);
    const partialBody = await partialRes.json() as { airStatus: string; weather: unknown; stationStatus: string };
    expect(partialBody.airStatus).toBe('fresh');
    expect(partialBody.weather).toBeNull();
    expect(partialBody.stationStatus).toBe('unavailable');

    const fullApp = createApp({ fetcher: makeMockFetcher() as unknown as typeof fetch, clock: () => NOW });
    const fullRes = await fullApp.fetch(new Request('http://localhost/api/environment?lat=18.52&lon=73.86'), {
      OPENAQ_API_KEY: 'valid-key',
    });
    const fullBody = await fullRes.json() as {
      stationStatus: string;
      station: { kind: string; name: string; pm25: { value: number } };
    };
    expect(fullBody.stationStatus).toBe('fresh');
    expect(fullBody.station.kind).toBe('openaq');
    expect(fullBody.station.name).toBe('Shivajinagar Station');
    expect(fullBody.station.pm25.value).toBe(33.5);

    const relayApp = createApp({
      fetcher: makeMockFetcher({ relayStatus: 200 }) as unknown as typeof fetch,
      clock: () => NOW,
    });
    const relayRes = await relayApp.fetch(new Request('http://localhost/api/environment?lat=18.52&lon=73.86'), {});
    const relayBody = await relayRes.json() as {
      stationStatus: string;
      station: { kind: string; name: string; aqi: number };
    };
    expect(relayBody.stationStatus).toBe('fresh');
    expect(relayBody.station.kind).toBe('cpcb-relay');
    expect(relayBody.station.name).toBe('Karve Road, Pune');
    expect(relayBody.station.aqi).toBe(118);
  });

  it('enforces origin, content-type, body-size, and rate limits on /api/ask', async () => {
    const app = createApp({ fetcher: makeMockFetcher() as unknown as typeof fetch, clock: () => NOW });
    const payload = {
      location: { lat: 28.61, lon: 77.21 },
      profile: {
        children: false, seniors: false, sensitive: false, work: 'office', commute: 'transit',
        workStart: 9, workEnd: 17, activity: 'errands', budget: 'zero',
      },
      question: 'Should I open the windows?',
      language: 'en',
    };

    const crossOrigin = await app.fetch(new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }));
    expect(crossOrigin.status).toBe(403);

    const wrongType = await app.fetch(new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(payload),
    }));
    expect(wrongType.status).toBe(415);

    const tooLarge = await app.fetch(new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, question: 'a'.repeat(5000) }),
    }));
    expect(tooLarge.status).toBe(413);

    for (let i = 0; i < 5; i++) {
      const ok = await app.fetch(new Request('http://localhost/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }), { clientAddress: 'valid-run' });
      expect(ok.status).toBe(200);
    }
    const limited = await app.fetch(new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }), { clientAddress: 'valid-run' });
    expect(limited.status).toBe(429);

    const notFound = await app.fetch(new Request('http://localhost/api/unknown'));
    expect(notFound.status).toBe(404);

    const unready = await app.fetch(new Request('http://localhost/api/ready'), { SAANS_PUBLIC_ORIGIN: 'http://insecure.example' });
    expect(unready.status).toBe(503);

    const preflightBlocked = await app.fetch(new Request('http://localhost/api/ask', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' },
    }), { SAANS_PUBLIC_ORIGIN: 'https://trusted.example' });
    expect(preflightBlocked.status).toBe(403);

    const preflightOk = await app.fetch(new Request('http://localhost/api/ask', {
      method: 'OPTIONS',
      headers: { Origin: 'https://trusted.example', 'Access-Control-Request-Method': 'POST' },
    }), { SAANS_PUBLIC_ORIGIN: 'https://trusted.example' });
    expect(preflightOk.status).toBe(204);
    expect(preflightOk.headers.get('access-control-allow-origin')).toBe('https://trusted.example');
  });

  it('maps upstream 429 and unexpected provider errors to 503 with Retry-After on rate limits', async () => {
    const rateLimitedFetcher = vi.fn(async () => new Response('busy', { status: 429 })) as unknown as typeof fetch;
    const limitedApp = createApp({ fetcher: rateLimitedFetcher, clock: () => NOW });
    const limitedRes = await limitedApp.fetch(new Request('http://localhost/api/places?q=Pune'));
    expect(limitedRes.status).toBe(503);
    expect(limitedRes.headers.get('retry-after')).toBe('60');
    expect(await limitedRes.json()).toMatchObject({ error: { code: 'UPSTREAM_LIMIT' } });

    const brokenFetcher = vi.fn(async () => new Response('error', { status: 500 })) as unknown as typeof fetch;
    const brokenApp = createApp({ fetcher: brokenFetcher, clock: () => NOW });
    const brokenRes = await brokenApp.fetch(new Request('http://localhost/api/places?q=Pune'));
    expect(brokenRes.status).toBe(503);
    expect(await brokenRes.json()).toMatchObject({ error: { code: 'UPSTREAM_UNAVAILABLE' } });
  });
});

describe('Worker entrypoint and staticAsset helper', () => {
  it('routes /api/health via worker and serves embedded static assets with CSP', async () => {
    const apiResponse = await worker.fetch(new Request('https://saans.example/api/health'), {});
    expect(apiResponse.status).toBe(200);
    expect(await apiResponse.json()).toEqual({ status: 'ok' });

    const manifest = {
      '/index.html': {
        type: 'text/html; charset=utf-8',
        base64: Buffer.from('<!doctype html><title>SaansAI</title>').toString('base64'),
      },
      '/assets/app.js': {
        type: 'text/javascript; charset=utf-8',
        base64: Buffer.from('console.log("ok")').toString('base64'),
      },
    };
    (globalThis as unknown as { __SAANS_ASSETS__?: typeof manifest }).__SAANS_ASSETS__ = manifest;
    try {
      const indexRes = staticAsset(new Request('https://saans.example/'), '/');
      expect(indexRes.status).toBe(200);
      expect(indexRes.headers.get('content-security-policy')).toContain("default-src 'self'");
      expect(await indexRes.text()).toContain('SaansAI');

      const assetRes = staticAsset(new Request('https://saans.example/assets/app.js'), '/assets/app.js');
      expect(assetRes.headers.get('cache-control')).toContain('immutable');

      const traversal = staticAsset(new Request('https://saans.example/../secret'), '/../secret');
      expect(traversal.status).toBe(403);

      const method = staticAsset(new Request('https://saans.example/', { method: 'POST' }), '/');
      expect(method.status).toBe(405);
    } finally {
      delete (globalThis as unknown as { __SAANS_ASSETS__?: typeof manifest }).__SAANS_ASSETS__;
    }
  });
});

describe('Vercel serverless handler (api/index.ts)', () => {
  it('routes API paths, preserves same-origin security, and isolates client rate limits via x-vercel-forwarded-for', async () => {
    const liveNow = Math.floor(Date.now() / 1000);
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.includes('air-quality-api.open-meteo.com')) {
        return new Response(JSON.stringify({
          current: { time: liveNow, us_aqi: 92, pm2_5: 29.4, pm10: 54.1 },
          hourly: { time: [liveNow, liveNow + HOUR, liveNow + 2 * HOUR], us_aqi: [92, 85, 78], pm2_5: [29.4, 26.2, 23.1], pm10: [54.1, 48.0, 44.0] },
        }), { status: 200 });
      }
      if (href.includes('api.open-meteo.com/v1/forecast')) {
        return new Response(JSON.stringify({ current: { time: liveNow, temperature_2m: 25.3, relative_humidity_2m: 52, wind_speed_10m: 9.4 } }), { status: 200 });
      }
      return new Response('unavailable', { status: 404 });
    }) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetcher);
    try {
      const health = await vercelHandler.fetch(new Request('https://saans.vercel.app/api/health'));
      expect(health.status).toBe(200);
      expect(await health.json()).toEqual({ status: 'ok' });

      const ready = await vercelHandler.fetch(new Request('https://saans.vercel.app/api/ready'));
      expect(ready.status).toBe(200);
      expect(await ready.json()).toEqual({ status: 'ready' });

      const envRes = await vercelHandler.fetch(new Request('https://saans.vercel.app/api/environment?lat=18.52&lon=73.86'));
      expect(envRes.status).toBe(200);
      expect(envRes.headers.get('cache-control')).toBe('no-store');
      expect(await envRes.json()).toMatchObject({ airStatus: 'fresh' });

      const payload = {
        location: { lat: 28.61, lon: 77.21 },
        profile: {
          children: false, seniors: false, sensitive: false, work: 'office', commute: 'transit',
          workStart: 9, workEnd: 17, activity: 'errands', budget: 'zero',
        },
        question: 'Should I open the windows?',
        language: 'en',
      };
      const evil = await vercelHandler.fetch(new Request('https://saans.vercel.app/api/ask', {
        method: 'POST',
        headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json', 'x-vercel-forwarded-for': '198.51.100.1' },
        body: JSON.stringify(payload),
      }));
      expect(evil.status).toBe(403);

      for (let i = 0; i < 5; i++) {
        const ok = await vercelHandler.fetch(new Request('https://saans.vercel.app/api/ask', {
          method: 'POST',
          headers: { Origin: 'https://saans.vercel.app', 'Content-Type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.10' },
          body: JSON.stringify(payload),
        }));
        expect(ok.status).toBe(200);
      }
      const throttled = await vercelHandler.fetch(new Request('https://saans.vercel.app/api/ask', {
        method: 'POST',
        headers: { Origin: 'https://saans.vercel.app', 'Content-Type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.10' },
        body: JSON.stringify(payload),
      }));
      expect(throttled.status).toBe(429);

      const otherClient = await vercelHandler.fetch(new Request('https://saans.vercel.app/api/ask', {
        method: 'POST',
        headers: { Origin: 'https://saans.vercel.app', 'Content-Type': 'application/json', 'x-vercel-forwarded-for': '203.0.113.11' },
        body: JSON.stringify(payload),
      }));
      expect(otherClient.status).toBe(200);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
