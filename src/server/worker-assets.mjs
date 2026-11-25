const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json; charset=utf-8',
};

const CSP = "default-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

function applyHeaders(headers, pathname) {
  headers.set('Content-Security-Policy', CSP);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set(
    'Cache-Control',
    pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  );
}

function readBundledAsset(pathname) {
  const manifest = globalThis.__SAANS_ASSETS__;
  if (!manifest) return null;
  const normalized = pathname === '/' ? '/index.html' : pathname;
  const entry = manifest[normalized] ?? (!normalized.includes('.') ? manifest['/index.html'] : undefined);
  if (!entry) return null;
  const binary = atob(entry.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, type: entry.type };
}

async function readLocalAsset(pathname) {
  if (typeof __SAANS_WORKER_BUNDLE__ !== 'undefined') return null;
  if (typeof process === 'undefined' || !process.versions?.node) return null;
  const { existsSync, readFileSync } = await import('node:fs');
  const { extname, resolve, sep } = await import('node:path');
  const root = resolve(process.cwd(), 'dist', 'client');
  if (!existsSync(root)) return null;
  const normalized = pathname === '/' ? '/index.html' : pathname;
  const candidate = resolve(root, '.' + normalized);
  if (candidate !== root && !candidate.startsWith(root + sep)) return null;
  const target = existsSync(candidate) ? candidate : (!normalized.includes('.') ? resolve(root, 'index.html') : null);
  if (!target || !existsSync(target)) return null;
  return {
    bytes: readFileSync(target),
    type: MIME[extname(target)] ?? 'application/octet-stream',
  };
}

/**
 * Serves built frontend assets with CSP and cache headers for Cloudflare Workers or Node tests.
 */
export async function staticAsset(request, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405 });
  }
  let cleanPath;
  try {
    cleanPath = decodeURIComponent(pathname.split('?')[0]);
  } catch {
    return new Response('Bad Request', { status: 400 });
  }
  if (cleanPath.includes('..')) {
    return new Response('Forbidden', { status: 403 });
  }
  const asset = readBundledAsset(cleanPath) ?? (await readLocalAsset(cleanPath));
  if (!asset) {
    return new Response('Not Found', { status: 404 });
  }
  const headers = new Headers({ 'Content-Type': asset.type });
  applyHeaders(headers, cleanPath);
  return new Response(request.method === 'HEAD' ? null : asset.bytes, { status: 200, headers });
}
