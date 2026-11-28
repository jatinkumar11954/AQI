import { z } from 'zod';
import {
  answerSchema,
  environmentSchema,
  searchResponseSchema,
  type Answer,
  type City,
  type Environment,
  type Profile,
} from '../shared/model';

export const environmentBudgetMs = 12_000;
export const assistantBudgetMs = 16_000;
type Coordinates = Pick<City, 'lat' | 'lon'>;
const locationParams = (city: Coordinates) => new URLSearchParams({ lat: String(city.lat), lon: String(city.lon) });

class HttpError extends Error {
  constructor(readonly status: number, message: string, readonly retryAfter: string | null = null) { super(message); }
}

const errorResponse = z.object({ error: z.object({ message: z.string() }) });
async function request<T>(path: string, schema: z.ZodType<T>, signal: AbortSignal, init: RequestInit = {}): Promise<T> {
  signal.throwIfAborted();
  const response = await fetch(path, { ...init, signal, credentials: 'omit' });
  const body: unknown = await response.json().catch(() => undefined);
  signal.throwIfAborted();
  if (!response.ok) {
    const error = errorResponse.safeParse(body).data;
    const message = error?.error.message ?? 'The data request could not be completed.';
    throw new HttpError(response.status, message, response.headers.get('Retry-After'));
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new HttpError(502, 'The data service returned an invalid response.');
  return parsed.data;
}

const transient = (cause: unknown) => cause instanceof TypeError || (cause instanceof HttpError
  && (cause.status === 502 || cause.status === 503 || cause.status === 504));

/** Fetches current air quality, hourly forecast, weather, and station readings for a coordinate pair. */
export async function readEnvironment(city: Coordinates, signal: AbortSignal): Promise<Environment> {
  const path = '/api/environment?' + locationParams(city);
  try {
    return await request(path, environmentSchema, signal);
  } catch (cause) {
    signal.throwIfAborted();
    if (!transient(cause) || (cause instanceof HttpError && cause.retryAfter)) throw cause;
    return request(path, environmentSchema, signal);
  }
}

/** Searches the same-origin geocoding API. */
export async function searchCities(query: string, signal: AbortSignal): Promise<City[]> {
  return (await request('/api/places?q=' + encodeURIComponent(query), searchResponseSchema, signal)).places;
}

/** Submits an air-quality question to `/api/ask` and falls back to deterministic local rules when offline or rate-limited. */
export async function askSaansAI(
  question: string,
  city: City,
  profile: Profile,
  language: 'en' | 'hi',
  environment: Environment,
  signal: AbortSignal,
): Promise<Answer> {
  signal.throwIfAborted();
  let fallbackStatus: Answer['status'] = 'unavailable';
  try {
    return await request('/api/ask', answerSchema, signal, {
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
  const { composeAnswer, inferTopic } = await import('../shared/assistant');
  return {
    ...composeAnswer(inferTopic(question), profile, environment, Math.floor(Date.now() / 1000), language),
    mode: 'rules', status: fallbackStatus,
  };
}
