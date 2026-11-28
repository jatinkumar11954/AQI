/** Error representing an HTTP or validation failure from an upstream provider. */
export class UpstreamError extends Error {
  constructor(readonly status: number) { super('Upstream request failed'); }
}

export type Fetcher = (url: URL, init?: RequestInit) => Promise<Response>;

const MAX_PROVIDER_BYTES = 256 * 1024;
async function boundedJson(response: Response) {
  if (Number(response.headers.get('Content-Length')) > MAX_PROVIDER_BYTES || !response.body) {
    await response.body?.cancel();
    throw new UpstreamError(422);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let content = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return JSON.parse(content + decoder.decode());
      size += value.byteLength;
      if (size > MAX_PROVIDER_BYTES) {
        await reader.cancel();
        throw new UpstreamError(422);
      }
      content += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

/** Builds a bounded-byte, timeout-protected, retrying JSON HTTP request helper. */
export function createTransport(fetcher: Fetcher) {
  return async function request(url: URL, init: RequestInit = {}, retries = 1, timeout = 2600): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetcher(url, { ...init, redirect: 'error', signal: controller.signal });
        if (!response.ok) {
          await response.body?.cancel();
          throw new UpstreamError(response.status);
        }
        return await boundedJson(response);
      } catch (error) {
        if (attempt >= retries || (error instanceof UpstreamError && error.status < 500 && error.status !== 408)) throw error;
      } finally {
        clearTimeout(timer);
      }
      await new Promise(resolve => setTimeout(resolve, 160));
    }
  };
}
/** Constructs an HTTPS request URL with stringified query parameters. */
export const url = (base: string, params: Record<string, string | number>) => {
  const target = new URL(base);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, String(value));
  return target;
};

/** Creates a bounded LRU-evicting in-memory cache with request coalescing and stale-on-error fallback. */
export function createCache<T>(maxKeys: number, ttl: number, staleTtl: number, clock: () => number) {
  const data = new Map<string, { value: T; at: number }>();
  const active = new Map<string, Promise<{ value: T; stale: boolean }>>();
  return async (key: string, get: () => Promise<T>) => {
    const cached = data.get(key);
    if (cached && clock() - cached.at < ttl) return { value: cached.value, stale: false };
    const pending = active.get(key);
    if (pending) return pending;
    if (active.size >= 16) {
      if (cached && clock() - cached.at <= staleTtl) return { value: cached.value, stale: true };
      throw new UpstreamError(503);
    }
    const task = Promise.resolve().then(get).then(value => {
      data.delete(key);
      if (data.size >= maxKeys) {
        for (const oldest of data.keys()) {
          data.delete(oldest);
          break;
        }
      }
      data.set(key, { value, at: clock() });
      return { value, stale: false };
    }).catch(error => {
      if (cached && clock() - cached.at <= staleTtl) return { value: cached.value, stale: true };
      throw error;
    }).finally(() => active.delete(key));
    active.set(key, task);
    return task;
  };
}

/** Creates a sliding fixed-window in-memory rate limiter with a bounded tracked-key table. */
export function createLimiter(clock: () => number, seconds = 60) {
  let reset = 0;
  const counts = new Map<string, number>();
  return (key: string, limit: number) => {
    if (clock() >= reset) {
      counts.clear();
      reset = clock() + seconds;
    }
    const used = counts.get(key) ?? 0;
    if (used >= limit || (!counts.has(key) && counts.size >= 4096)) return false;
    counts.set(key, used + 1);
    return true;
  };
}
