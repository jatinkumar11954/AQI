import { createApp } from './app';
import type { Keys } from './config';
import { staticAsset } from './worker-assets.mjs';

const api = createApp();
export default {
  async fetch(request: Request, env: Keys) {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) {
      return api.fetch(request, { ...env, clientAddress: request.headers.get('CF-Connecting-IP') ?? 'edge' });
    }
    return staticAsset(request, pathname);
  },
};
