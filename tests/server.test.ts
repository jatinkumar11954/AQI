import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server/app';
import { HOUR } from '../src/shared/model';
import worker from '../src/server/worker';
import { staticAsset } from '../src/server/worker-assets.mjs';

const NOW = 1795631400;

function makeMockFetcher({ weatherFails = false, openaqStatus = 200 }: { weatherFails?: boolean; openaqStatus?: number } = {}) {
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

  it('handles partial upstream failures and OpenAQ station observations', async () => {
    const partialApp = createApp({
      fetcher: makeMockFetcher({ weatherFails: true, openaqStatus: 401 }) as unknown as typeof fetch,
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
    const fullBody = await fullRes.json() as { stationStatus: string; station: { name: string; pm25: { value: number } } };
    expect(fullBody.stationStatus).toBe('fresh');
    expect(fullBody.station.name).toBe('Shivajinagar Station');
    expect(fullBody.station.pm25.value).toBe(33.5);
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
      }));
      expect(ok.status).toBe(200);
    }
    const limited = await app.fetch(new Request('http://localhost/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }));
    expect(limited.status).toBe(429);
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
      const indexRes = await staticAsset(new Request('https://saans.example/'), '/');
      expect(indexRes.status).toBe(200);
      expect(indexRes.headers.get('content-security-policy')).toContain("default-src 'self'");
      expect(await indexRes.text()).toContain('SaansAI');

      const assetRes = await staticAsset(new Request('https://saans.example/assets/app.js'), '/assets/app.js');
      expect(assetRes.headers.get('cache-control')).toContain('immutable');

      const traversal = await staticAsset(new Request('https://saans.example/../secret'), '/../secret');
      expect(traversal.status).toBe(403);

      const method = await staticAsset(new Request('https://saans.example/', { method: 'POST' }), '/');
      expect(method.status).toBe(405);
    } finally {
      delete (globalThis as unknown as { __SAANS_ASSETS__?: typeof manifest }).__SAANS_ASSETS__;
    }
  });
});
