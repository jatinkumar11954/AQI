const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'";

function applyHeaders(headers, pathname) {
  headers.set('Content-Security-Policy', CSP);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  headers.set(
    'Cache-Control',
    pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
  );
}

function readBundledAsset(pathname) {
  const manifest = globalThis.__SAANS_ASSETS__;
  if (!manifest) return null;
  const normalized = pathname === '/' ? '/index.html' : pathname;
  const entry = Object.hasOwn(manifest, normalized) ? manifest[normalized] : undefined;
  if (!entry) return null;
  const binary = atob(entry.base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return { bytes, type: entry.type };
}

/**
 * Serves built frontend assets from the embedded worker manifest with CSP and cache headers.
 */
export function staticAsset(request, pathname) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'GET, HEAD' } });
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
  const asset = readBundledAsset(cleanPath);
  if (!asset) {
    return new Response('Not Found', { status: 404 });
  }
  const headers = new Headers({ 'Content-Type': asset.type });
  applyHeaders(headers, cleanPath);
  return new Response(request.method === 'HEAD' ? null : asset.bytes, { status: 200, headers });
}
