import { createApp } from '../src/server/app';
import type { Keys } from '../src/server/config';

const productionOrigin = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL
  : undefined;

const api = createApp({ publicServiceOrigin: productionOrigin });

export default {
  fetch(request: Request) {
    const forwarded = request.headers.get('x-vercel-forwarded-for');
    const clientAddress = forwarded?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')?.trim()
      || 'vercel';
    const env: Keys = {
      OPENAQ_API_KEY: process.env.OPENAQ_API_KEY,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GEMINI_MODEL: process.env.GEMINI_MODEL,
      GEMINI_DAILY_LIMIT: process.env.GEMINI_DAILY_LIMIT,
      SAANS_PUBLIC_ORIGIN: process.env.SAANS_PUBLIC_ORIGIN,
    };
    return api.fetch(request, { ...env, clientAddress });
  },
};
