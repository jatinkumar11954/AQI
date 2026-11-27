import { httpsOrigin } from '../shared/deployment';
import { type Answer } from '../shared/assistant';
import { type City, type Environment, type Profile } from '../shared/model';

const pages = import.meta.env.MODE === 'pages';
const apiOrigin = pages ? httpsOrigin(import.meta.env.VITE_API_BASE_URL) : undefined;
const publicData = pages && !apiOrigin;
export const environmentBudgetMs = apiOrigin ? 75_000 : 12_000;
export const assistantBudgetMs = apiOrigin ? 75_000 : 16_000;
type Coordinates = Pick<City, 'lat' | 'lon'>;
const locationParams = (city: Coordinates) => new URLSearchParams({ lat: String(city.lat), lon: String(city.lon) });
let browserFeeds: Promise<ReturnType<typeof import('../shared/environment').createEnvironment>> | undefined;

function publicFeeds() {
  return browserFeeds ??= import('../shared/environment').then(({ createEnvironment }) =>
    createEnvironment((target, settings) => fetch(target, { ...settings, credentials: 'omit' }), () => Math.floor(Date.now() / 1000)),
  );
}

class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function request<T>(path: string, signal: AbortSignal, init: RequestInit = {}): Promise<T> {
  const response = await fetch((apiOrigin ?? '') + path, { ...init, signal, credentials: 'omit' });
  const data = await response.json().catch(() => null);
  if (!response.ok || data == null) throw new HttpError(response.ok ? 502 : response.status, data?.error?.message ?? 'The data request could not be completed.');
  return data;
}

const transient = (cause: unknown) => cause instanceof TypeError || (cause instanceof HttpError
  && (cause.status === 502 || cause.status === 503 || cause.status === 504));

export async function readEnvironment(city: Coordinates, signal: AbortSignal): Promise<Environment> {
  if (publicData) return (await publicFeeds()).get(city);
  const path = '/api/environment?' + locationParams(city);
  try {
    return await request(path, signal);
  } catch (cause) {
    if (!transient(cause)) throw cause;
    signal.throwIfAborted();
    return request(path, signal);
  }
}

export async function searchCities(query: string, signal: AbortSignal): Promise<City[]> {
  if (publicData) {
    if (!/^[\p{L}\p{M}\p{N} .,'’()-]{2,64}$/u.test(query)) throw new Error('Enter a city or neighbourhood with 2–64 characters.');
    return (await publicFeeds()).search(query);
  }
  return (await request<{ places: City[] }>('/api/places?q=' + encodeURIComponent(query), signal)).places;
}

export async function askSaansAI(question: string, city: City, profile: Profile, language: 'en' | 'hi', environment: Environment, signal: AbortSignal): Promise<Answer> {
  let fallbackStatus: Answer['status'] = publicData ? 'unconfigured' : 'unavailable';
  if (!publicData) {
    try {
      return await request('/api/ask', signal, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ location: { lat: city.lat, lon: city.lon }, profile, question, language }),
      });
    } catch (cause) {
      if (cause instanceof HttpError && cause.status === 429) {
        fallbackStatus = 'quota';
      } else if (!transient(cause) && !(cause instanceof Error && cause.name === 'TimeoutError')) {
        throw cause;
      }
    }
  }
  const { composeAnswer, inferTopic } = await import('../shared/assistant');
  return {
    ...composeAnswer(inferTopic(question), profile, environment, Math.floor(Date.now() / 1000), language),
    mode: 'rules', status: fallbackStatus,
  };
}
