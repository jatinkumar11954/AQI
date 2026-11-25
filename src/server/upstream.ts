export class UpstreamError extends Error {
  constructor(readonly status: number) { super('Upstream request failed'); }
}

export function createTransport(fetcher: typeof fetch) {
  return async function request(url: URL, init: RequestInit = {}, retries = 1, timeout = 2600): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await fetcher(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(timeout) });
        if (!response.ok) {
          await response.body?.cancel();
          throw new UpstreamError(response.status);
        }
        return await response.json();
      } catch (error) {
        if (attempt >= retries || (error instanceof UpstreamError && error.status < 500 && error.status !== 408)) throw error;
        await new Promise(resolve => setTimeout(resolve, 160));
      }
    }
  };
}
export const url = (base: string, params: Record<string, string | number>) => {
  const target = new URL(base);
  for (const [key, value] of Object.entries(params)) target.searchParams.set(key, String(value));
  return target;
};

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
      if (data.size >= maxKeys) data.delete(data.keys().next().value!);
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
