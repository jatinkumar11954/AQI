import { afterEach, describe, expect, it, vi } from 'vitest';
import { CITIES, DEFAULT_PROFILE } from '../src/shared/model';
import {
  askSaansAI,
  assistantBudgetMs,
  environmentBudgetMs,
  readEnvironment,
  searchCities,
} from '../src/client/data';
import { modeled } from './fixtures';

const location = CITIES[0];
const environmentPath = '/api/environment?lat=28.61&lon=77.21';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Same-origin API client', () => {
  it('uses the same-origin budget and retries one transient environment failure', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('gateway', { status: 503 }))
      .mockResolvedValueOnce(Response.json(modeled()));
    vi.stubGlobal('fetch', fetcher);
    const { signal } = new AbortController();

    expect(environmentBudgetMs).toBe(12_000);
    await expect(readEnvironment(location, signal)).resolves.toEqual(modeled());
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenNthCalledWith(1, environmentPath, { credentials: 'omit', signal });
    expect(fetcher).toHaveBeenNthCalledWith(2, environmentPath, { credentials: 'omit', signal });
  });

  it('stops after the second transient failure', async () => {
    const fetcher = vi.fn(async () => new Response('gateway', { status: 504 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(readEnvironment(location, new AbortController().signal)).rejects.toMatchObject({ status: 504 });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('does not retry throttled or aborted requests', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: { message: 'Try later.' } }, { status: 429 }))
      .mockImplementationOnce(async () => {
        controller.abort();
        throw new TypeError('aborted network');
      });
    vi.stubGlobal('fetch', fetcher);
    await expect(readEnvironment(location, new AbortController().signal)).rejects.toThrow('Try later.');
    await expect(readEnvironment(location, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(readEnvironment(location, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('honors a Retry-After response and retries an invalid successful environment response once', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ error: { message: 'Provider cooling down.' } }, { status: 503, headers: { 'Retry-After': '60' } }))
      .mockResolvedValueOnce(Response.json({ airStatus: 'fresh', air: { current: { aqi: 82 } } }))
      .mockResolvedValueOnce(Response.json(modeled()));
    vi.stubGlobal('fetch', fetcher);
    const { signal } = new AbortController();
    await expect(readEnvironment(location, signal)).rejects.toThrow('Provider cooling down.');
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(readEnvironment(location, signal)).resolves.toEqual(modeled());
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('rejects invalid city results and falls back for unrecognized assistant source IDs', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ places: [{ name: 'Pune', lat: 180 }] }))
      .mockResolvedValueOnce(Response.json({ mode: 'gemini', text: 'Check outdoor air.', context: '', sources: ['unknown'] }));
    vi.stubGlobal('fetch', fetcher);
    const { signal } = new AbortController();
    await expect(searchCities('Pune', signal)).rejects.toThrow('The data service returned an invalid response.');
    const answer = await askSaansAI('Should I open windows?', location, DEFAULT_PROFILE, 'en', modeled(), signal);
    expect(answer).toMatchObject({ mode: 'rules', status: 'unavailable', sources: ['clean'] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('retains a valid partial response without contacting a separate provider', async () => {
    const partial = { ...modeled(), weather: null, station: null, stationStatus: 'unavailable' };
    const fetcher = vi.fn(async () => Response.json(partial));
    vi.stubGlobal('fetch', fetcher);
    const { signal } = new AbortController();

    await expect(readEnvironment(location, signal)).resolves.toEqual(partial);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(environmentPath, { credentials: 'omit', signal });
  });

  it('propagates city search cancellation without interfering with a concurrent search', async () => {
    const place = { name: 'Pune', state: 'Maharashtra', lat: 18.52, lon: 73.86 };
    const first = new AbortController();
    const fetcher = vi.fn(async (_input: string, options: RequestInit) => {
      const signal = options.signal;
      if (signal === first.signal) {
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
      }
      return Response.json({ places: [place] });
    });
    vi.stubGlobal('fetch', fetcher);

    const canceled = searchCities('Pune', first.signal);
    const second = searchCities('Pune', new AbortController().signal);
    first.abort();

    await expect(canceled).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).resolves.toEqual([place]);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('answers with on-device rules if the backend cannot process the assistant request', async () => {
    const fetcher = vi.fn(async () => new Response('waking', { status: 502 }));
    vi.stubGlobal('fetch', fetcher);
    const answer = await askSaansAI('Should I open windows?', location, DEFAULT_PROFILE, 'en', modeled(), new AbortController().signal);
    expect(answer).toMatchObject({ mode: 'rules', status: 'unavailable', sources: ['clean'] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('falls back to quota-labeled rules mode if /api/ask is rate-limited (429)', async () => {
    const fetcher = vi.fn(async () => Response.json({ error: { message: 'Too many requests.' } }, { status: 429 }));
    vi.stubGlobal('fetch', fetcher);
    const answer = await askSaansAI('Should I open windows?', location, DEFAULT_PROFILE, 'en', modeled(), new AbortController().signal);
    expect(answer).toMatchObject({ mode: 'rules', status: 'quota', sources: ['clean'] });
  });

  it('uses an encoded same-origin geocoding URL and returns validated results', async () => {
    const place = { name: 'Pune', state: 'Maharashtra', lat: 18.52, lon: 73.86 };
    const fetcher = vi.fn(async () => Response.json({ places: [place] }));
    vi.stubGlobal('fetch', fetcher);
    const { signal } = new AbortController();

    await expect(searchCities('Pune Maharashtra', signal)).resolves.toEqual([place]);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/places?q=Pune%20Maharashtra', { credentials: 'omit', signal });
  });

  it('passes a validated rules answer through from the same-origin API', async () => {
    const answer = { mode: 'rules', status: 'unconfigured', text: 'Check local readings.', context: '', sources: ['cpcb'] };
    const fetcher = vi.fn(async () => Response.json(answer));
    vi.stubGlobal('fetch', fetcher);
    const { signal } = new AbortController();
    const question = 'What is my local AQI?';

    expect(assistantBudgetMs).toBe(16_000);
    await expect(askSaansAI(question, location, DEFAULT_PROFILE, 'en', modeled(), signal)).resolves.toEqual(answer);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: { lat: location.lat, lon: location.lon },
        profile: DEFAULT_PROFILE,
        question,
        language: 'en',
      }),
      credentials: 'omit',
      signal,
    });
  });

  it('uses a local rules answer when an in-flight assistant request times out', async () => {
    const controller = new AbortController();
    const timeout = new DOMException('Timed out', 'TimeoutError');
    const fetcher = vi.fn(async () => {
      controller.abort(timeout);
      throw timeout;
    });
    vi.stubGlobal('fetch', fetcher);
    const question = 'Should I open windows?';

    await expect(askSaansAI(question, location, DEFAULT_PROFILE, 'en', modeled(), controller.signal))
      .resolves.toMatchObject({ mode: 'rules', status: 'unavailable', sources: ['clean'] });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('rethrows non-transient 400 validation errors on /api/ask', async () => {
    const fetcher = vi.fn(async () => Response.json({ error: { message: 'Invalid question.' } }, { status: 400 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(askSaansAI('x', location, DEFAULT_PROFILE, 'en', modeled(), new AbortController().signal))
      .rejects.toThrow('Invalid question.');
  });
});
