import { afterEach, describe, expect, it, vi } from 'vitest';
import { CITIES, DEFAULT_PROFILE } from '../src/shared/model';
import { modeled, providerAir } from './fixtures';

const origin = 'https://backend.example';
const location = CITIES[0];

async function connect(fetcher: typeof fetch) {
  vi.stubEnv('MODE', 'pages');
  vi.stubEnv('VITE_API_BASE_URL', origin);
  vi.stubGlobal('fetch', fetcher);
  vi.resetModules();
  return import('../src/client/data');
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Pages network recovery', () => {
  it('retries a single idempotent environment read after a cold-start gateway response', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('<html>waking service</html>', { status: 503 }))
      .mockResolvedValueOnce(Response.json(modeled()));
    const api = await connect(fetcher);
    await expect(api.readEnvironment(location, new AbortController().signal)).resolves.toMatchObject({ airStatus: 'fresh' });
    expect(api.environmentBudgetMs).toBeGreaterThan(60_000);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe(origin + '/api/environment?lat=28.61&lon=77.21');
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: 'omit' });
  });

  it('retries one transient environment failure on same-origin deployments such as Vercel or Node', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('gateway', { status: 503 }))
      .mockResolvedValueOnce(Response.json(modeled()));
    vi.stubEnv('MODE', 'production');
    vi.stubGlobal('fetch', fetcher);
    vi.resetModules();
    const api = await import('../src/client/data');
    await expect(api.readEnvironment(location, new AbortController().signal)).resolves.toMatchObject({ airStatus: 'fresh' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe('/api/environment?lat=28.61&lon=77.21');
  });

  it('does not retry throttled or aborted requests', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: { message: 'Try later.' } }, { status: 429 }))
      .mockImplementationOnce(async () => {
        controller.abort();
        throw new TypeError('aborted network');
      });
    const api = await connect(fetcher);
    await expect(api.readEnvironment(location, new AbortController().signal)).rejects.toThrow('Try later.');
    await expect(api.readEnvironment(location, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(api.readEnvironment(location, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('honors a Retry-After response and retries an invalid successful environment response once', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: { message: 'Provider cooling down.' } }, { status: 503, headers: { 'Retry-After': '60' } }))
      .mockResolvedValueOnce(Response.json({ airStatus: 'fresh', air: { current: { aqi: 82 } } }))
      .mockResolvedValueOnce(Response.json(modeled()));
    const api = await connect(fetcher);
    const { signal } = new AbortController();
    await expect(api.readEnvironment(location, signal)).rejects.toThrow('Provider cooling down.');
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(api.readEnvironment(location, signal)).resolves.toEqual(modeled());
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('rejects invalid city results and falls back for unrecognized assistant source IDs', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ places: [{ name: 'Pune', lat: 180 }] }))
      .mockResolvedValueOnce(Response.json({ mode: 'gemini', text: 'Check outdoor air.', context: '', sources: ['unknown'] }));
    const api = await connect(fetcher);
    const { signal } = new AbortController();
    await expect(api.searchCities('Pune', signal)).rejects.toThrow('The data service returned an invalid response.');
    const answer = await api.askSaansAI('Should I open windows?', location, DEFAULT_PROFILE, 'en', modeled(), signal);
    expect(answer).toMatchObject({ mode: 'rules', status: 'unavailable', sources: ['clean'] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('lets a canceled keyless caller stop waiting while a duplicate lookup finishes', async () => {
    vi.stubEnv('MODE', 'pages');
    vi.stubEnv('VITE_API_BASE_URL', '');
    let respond!: (value: Response) => void;
    const response = new Promise<Response>(resolve => { respond = resolve; });
    const fetcher = vi.fn(() => response);
    vi.stubGlobal('fetch', fetcher);
    vi.resetModules();
    const api = await import('../src/client/data');
    const first = new AbortController();
    const canceled = api.searchCities('Pune', first.signal);
    const shared = api.searchCities('Pune', new AbortController().signal);
    try {
      await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
      first.abort();
      await expect(canceled).rejects.toMatchObject({ name: 'AbortError' });
    } finally {
      respond(Response.json({ results: [
        { name: 'Pune', admin1: 'Maharashtra', country_code: 'IN', latitude: 18.52, longitude: 73.86 },
      ] }));
    }
    await expect(shared).resolves.toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('returns a partial environment from the keyless Pages providers', async () => {
    vi.stubEnv('MODE', 'pages');
    vi.stubEnv('VITE_API_BASE_URL', '');
    const payload = providerAir(Math.floor(Date.now() / 1000));
    const fetcher = vi.fn(async (target: URL) => target.hostname === 'air-quality-api.open-meteo.com'
      ? Response.json(payload) : new Response(null, { status: 404 }));
    vi.stubGlobal('fetch', fetcher);
    vi.resetModules();
    const api = await import('../src/client/data');
    const result = await api.readEnvironment(location, new AbortController().signal);
    expect(result).toMatchObject({ air: { current: { aqi: 82 } }, airStatus: 'fresh', weather: null, station: null });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('answers with on-device rules if the backend cannot process the assistant request', async () => {
    const fetcher = vi.fn(async () => new Response('waking', { status: 502 }));
    const api = await connect(fetcher);
    const answer = await api.askSaansAI('Should I open windows?', location, DEFAULT_PROFILE, 'en', modeled(), new AbortController().signal);
    expect(answer).toMatchObject({ mode: 'rules', status: 'unavailable', sources: ['clean'] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('falls back to quota-labeled rules mode if /api/ask is rate-limited (429)', async () => {
    const fetcher = vi.fn(async () => Response.json({ error: { message: 'Too many requests.' } }, { status: 429 }));
    const api = await connect(fetcher);
    const answer = await api.askSaansAI('Should I open windows?', location, DEFAULT_PROFILE, 'en', modeled(), new AbortController().signal);
    expect(answer).toMatchObject({ mode: 'rules', status: 'quota', sources: ['clean'] });
  });

  it('validates keyless search constraints and keeps assistant requests local', async () => {
    vi.stubEnv('MODE', 'pages');
    vi.stubEnv('VITE_API_BASE_URL', '');
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    vi.resetModules();
    const api = await import('../src/client/data');
    const { signal } = new AbortController();
    await expect(api.searchCities('a', signal)).rejects.toThrow('Enter a city or neighbourhood');
    const answer = await api.askSaansAI('Can children play outside?', location, DEFAULT_PROFILE, 'en', modeled(), signal);
    expect(answer).toMatchObject({ mode: 'rules', status: 'unconfigured', sources: ['clean'] });
    expect(fetcher).not.toHaveBeenCalled();

    const geocoder = vi.fn(async (input: RequestInfo | URL) => {
      const href = String(input);
      if (href.includes('geocoding-api.open-meteo.com')) {
        return Response.json({
          results: [{ name: 'Pune', admin1: 'Maharashtra', country_code: 'IN', latitude: 18.52, longitude: 73.86 }],
        });
      }
      return new Response('unavailable', { status: 503 });
    });
    vi.stubGlobal('fetch', geocoder);
    await expect(api.searchCities('Pune', signal)).resolves.toEqual([
      { name: 'Pune', state: 'Maharashtra', lat: 18.52, lon: 73.86 },
    ]);
  });

  it('calls /api/places directly in same-origin production mode', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL) => Response.json({
      places: [{ name: 'Pune', state: 'Maharashtra', lat: 18.52, lon: 73.86 }],
    }));
    vi.stubEnv('MODE', 'production');
    vi.stubGlobal('fetch', fetcher);
    vi.resetModules();
    const api = await import('../src/client/data');
    await expect(api.searchCities('Pune', new AbortController().signal)).resolves.toHaveLength(1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/places?q=Pune');
  });

  it('rethrows non-transient 400 validation errors on /api/ask', async () => {
    const fetcher = vi.fn(async () => Response.json({ error: { message: 'Invalid question.' } }, { status: 400 }));
    const api = await connect(fetcher);
    await expect(api.askSaansAI('x', location, DEFAULT_PROFILE, 'en', modeled(), new AbortController().signal))
      .rejects.toThrow('Invalid question.');
  });
});
