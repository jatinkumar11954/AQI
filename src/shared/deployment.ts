export const DATA_ORIGINS = [
  'https://air-quality-api.open-meteo.com',
  'https://api.open-meteo.com',
  'https://geocoding-api.open-meteo.com',
  'https://api.dharun.dev',
];

/** Validates a configured HTTPS origin with no credentials, path, query, or hash. */
export function httpsOrigin(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (
      url.protocol === 'https:'
      && !url.username
      && !url.password
      && url.pathname === '/'
      && !url.search
      && !url.hash
    ) {
      return url.origin;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
