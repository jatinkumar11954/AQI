import { Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { secureHeaders } from 'hono/secure-headers';
import { z } from 'zod';
import { pointSchema, profileSchema } from '../shared/model';
import { createEnvironment } from '../shared/environment';
import { httpsOrigin } from '../shared/deployment';
import type { Keys } from './config';
import { createAssistant } from './gemini';
import { createLimiter, UpstreamError, type Fetcher } from '../shared/upstream';

export type Runtime = Keys & { clientAddress?: string };
const questionSchema = z.object({
  location: pointSchema, profile: profileSchema, question: z.string().trim().min(2).max(350),
  language: z.enum(['en', 'hi']).default('en'),
}).strict();
const searchSchema = z.string().trim().min(2).max(64).regex(/^[\p{L}\p{M}\p{N} .,'’()-]+$/u);
const decimal = z.union([z.number(), z.string().regex(/^-?\d{1,3}(?:\.\d{1,10})?$/).transform(Number)]);
const querySchema = z.object({ lat: decimal, lon: decimal }).pipe(pointSchema);
const issue = (code: string, message: string) => ({ error: { code, message } });

export function createApp({
  fetcher = (target, init) => globalThis.fetch(target, init), clock = () => Math.floor(Date.now() / 1000), developmentOrigin,
}: { fetcher?: Fetcher; clock?: () => number; developmentOrigin?: string } = {}) {
  const environment = createEnvironment(fetcher, clock);
  const answer = createAssistant(fetcher, clock);
  const limit = createLimiter(clock);
  const app = new Hono<{ Bindings: Runtime }>();

  app.use('/api/*', secureHeaders({ crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false }));
  app.use('/api/*', async (context, next) => {
    context.header('Cache-Control', 'no-store');
    context.header('Vary', 'Origin');
    const origin = context.req.header('origin');
    const trusted = origin && origin === httpsOrigin(context.env?.SAANS_PUBLIC_ORIGIN);
    if (trusted) context.header('Access-Control-Allow-Origin', origin);
    if (context.req.method === 'OPTIONS') {
      if (!trusted || context.req.path !== '/api/ask'
        || context.req.header('access-control-request-method') !== 'POST') {
        return context.json(issue('FORBIDDEN_ORIGIN', 'Use the assistant from this site.'), 403);
      }
      context.header('Access-Control-Allow-Methods', 'POST');
      context.header('Access-Control-Allow-Headers', 'Content-Type');
      context.header('Access-Control-Max-Age', '600');
      return context.body(null, 204);
    }
    if (context.req.path !== '/api/health' && context.req.path !== '/api/ready') {
      const ip = context.env?.clientAddress ?? 'local';
      const isChat = context.req.path === '/api/ask';
      if (!limit((isChat ? 'ask:' : 'read:') + ip, isChat ? 5 : 36)) {
        context.header('Retry-After', '60');
        return context.json(issue('RATE_LIMIT', 'Too many requests. Try again in a minute.'), 429);
      }
    }
    await next();
  });

  app.get('/api/health', context => context.json({ status: 'ok' }));
  app.get('/api/ready', context => {
    const origin = context.env?.SAANS_PUBLIC_ORIGIN;
    if (origin && !httpsOrigin(origin)) return context.json({ status: 'not_ready' }, 503);
    return context.json({ status: 'ready' });
  });
  app.get('/api/places', async context => {
    const query = searchSchema.safeParse(context.req.query('q'));
    if (!query.success) return context.json(issue('INVALID_SEARCH', 'Enter a city or postcode with 2–64 characters.'), 400);
    return context.json({ places: await environment.search(query.data) });
  });
  app.get('/api/environment', async context => {
    const parsed = querySchema.safeParse({ lat: context.req.query('lat'), lon: context.req.query('lon') });
    if (!parsed.success) return context.json(issue('INVALID_LOCATION', 'Choose an Indian city from search.'), 400);
    return context.json(await environment.get(parsed.data, context.env?.OPENAQ_API_KEY));
  });
  app.post('/api/ask', bodyLimit({
    maxSize: 4096, onError: context => context.json(issue('BODY_TOO_LARGE', 'The question or profile is too large.'), 413),
  }), async context => {
    const origin = context.req.header('origin');
    if (origin && origin !== new URL(context.req.url).origin && origin !== developmentOrigin
      && origin !== httpsOrigin(context.env?.SAANS_PUBLIC_ORIGIN)) {
      return context.json(issue('FORBIDDEN_ORIGIN', 'Use the assistant from this site.'), 403);
    }
    if (context.req.header('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
      return context.json(issue('CONTENT_TYPE', 'Send a JSON request.'), 415);
    }
    const parsed = questionSchema.safeParse(await context.req.json().catch(() => null));
    if (!parsed.success) return context.json(issue('INVALID_QUESTION', 'Check the question, selected city and household profile.'), 400);
    const { location, profile, question, language } = parsed.data;
    const keys = context.env ?? {};
    const data = await environment.get(location, keys.OPENAQ_API_KEY);
    return context.json(await answer(question, profile, data, language, keys));
  });
  app.notFound(context => context.json(issue('NOT_FOUND', 'This route is unavailable.'), 404));
  app.onError((error, context) => {
    if (error instanceof UpstreamError && error.status === 429) {
      context.header('Retry-After', '60');
      return context.json(issue('UPSTREAM_LIMIT', 'The data provider is busy. Try again shortly.'), 503);
    }
    return context.json(issue('UPSTREAM_UNAVAILABLE', 'The data provider is temporarily unavailable.'), 503);
  });
  return app;
}
