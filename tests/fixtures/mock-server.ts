import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { createApp } from '../../src/server/app';
import { HOUR } from '../../src/shared/model';

const port = 4179;
const now = () => Math.floor(Date.now() / 1000);

const mockFetcher: typeof fetch = async (input) => {
  const href = String(input);
  const current = now();
  const baseHour = Math.floor(current / HOUR) * HOUR;
  if (href.includes('geocoding-api.open-meteo.com')) {
    return new Response(JSON.stringify({
      results: [
        { name: 'Pune', admin1: 'Maharashtra', country_code: 'IN', latitude: 18.52, longitude: 73.86 },
      ],
    }), { status: 200 });
  }
  if (href.includes('air-quality-api.open-meteo.com')) {
    const times = Array.from({ length: 48 }, (_, i) => baseHour + i * HOUR);
    const aqis = times.map((_, i) => (i % 24 >= 7 && i % 24 <= 9 ? 44 : 88));
    const pm25 = aqis.map(a => Number((a * 0.31).toFixed(1)));
    const pm10 = aqis.map(a => Number((a * 0.62).toFixed(1)));
    return new Response(JSON.stringify({
      current: { time: current - 300, us_aqi: 88, pm2_5: 27.3, pm10: 54.6 },
      hourly: { time: times, us_aqi: aqis, pm2_5: pm25, pm10 },
    }), { status: 200 });
  }
  if (href.includes('api.open-meteo.com/v1/forecast')) {
    return new Response(JSON.stringify({
      current: { time: current - 300, temperature_2m: 24.5, relative_humidity_2m: 48, wind_speed_10m: 9.2 },
    }), { status: 200 });
  }
  return new Response('not found', { status: 404 });
};

const api = createApp({ fetcher: mockFetcher, clock: now });
const app = new Hono();
app.use('*', secureHeaders({ crossOriginEmbedderPolicy: false }));
app.use('*', async (context, next) => {
  context.header('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  await next();
});
app.use('*', serveStatic({ root: './dist/client' }));

serve({
  port,
  hostname: '127.0.0.1',
  fetch: (request, info) => {
    if (new URL(request.url).pathname.startsWith('/api/')) {
      return api.fetch(request, { clientAddress: info.incoming.socket.remoteAddress });
    }
    return app.fetch(request);
  },
}, () => {
  console.log('Mock E2E server listening on http://127.0.0.1:' + port);
});
