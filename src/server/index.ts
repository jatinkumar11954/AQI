import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { createApp } from './app.js';

const port = Number(process.env.PORT || '4173');
const dev = process.argv.includes('--dev');
const api = createApp({
  developmentOrigin: dev ? 'http://127.0.0.1:' + port : undefined,
});
const keys = {
  OPENAQ_API_KEY: process.env.OPENAQ_API_KEY,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  GEMINI_MODEL: process.env.GEMINI_MODEL,
  GEMINI_DAILY_LIMIT: process.env.GEMINI_DAILY_LIMIT,
  SAANS_PUBLIC_ORIGIN: process.env.SAANS_PUBLIC_ORIGIN,
};
if (dev) {
  const { createServer } = await import('vite');
  const vite = await createServer({ server: {
    host: '127.0.0.1', port, strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:' + (port + 1) },
  } });
  serve({ port: port + 1, hostname: '127.0.0.1', fetch: request => api.fetch(request, keys) });
  await vite.listen();
  vite.printUrls();
} else {
  const app = new Hono();
  app.use('*', secureHeaders({ crossOriginEmbedderPolicy: false }));
  app.use('*', async (context, next) => {
    context.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    await next();
  });
  app.use('/assets/*', async (context, next) => {
    await next();
    if (context.res.ok) context.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  app.use('*', serveStatic({ root: './dist/client' }));
  serve({ port, fetch: (request, info) => {
    if (new URL(request.url).pathname.startsWith('/api/')) return api.fetch(request, { ...keys, clientAddress: info.incoming.socket.remoteAddress });
    return app.fetch(request);
  } }, () => console.log('SaansAI listening on port ' + port));
}
