export const DATA_ORIGINS = [
  'https://air-quality-api.open-meteo.com',
  'https://api.open-meteo.com',
  'https://geocoding-api.open-meteo.com',
  'https://api.dharun.dev',
];

export function httpsOrigin(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    if (url.protocol === 'https:' && !url.username && !url.password
      && url.pathname === '/' && !url.search && !url.hash) return url.origin;
  } catch {
    return undefined;
  }
}
