import { createEnvironment } from '../shared/environment';
import { httpsOrigin } from '../shared/deployment';
import { composeAnswer, inferTopic, type Answer } from '../shared/assistant';
import { type City, type Environment, type Profile } from '../shared/model';

const pages = import.meta.env.MODE === 'pages';
const apiOrigin = pages ? httpsOrigin(import.meta.env.VITE_API_BASE_URL) : undefined;
const publicData = pages && !apiOrigin;
const clientEnvironment = publicData
  ? createEnvironment((target, settings) => fetch(target, { ...settings, credentials: 'omit' }), () => Math.floor(Date.now() / 1000))
  : null;
const locationParams = (city: City) => new URLSearchParams({ lat: String(city.lat), lon: String(city.lon) });

async function request<T>(path: string, signal: AbortSignal, init: RequestInit = {}): Promise<T> {
  const response = await fetch((apiOrigin ?? '') + path, { ...init, signal, credentials: 'omit' });
  const data = await response.json().catch(() => null);
  if (!response.ok || data == null) throw new Error(data?.error?.message ?? 'The data request could not be completed.');
  return data;
}

export function readEnvironment(city: City, signal: AbortSignal): Promise<Environment> {
  return clientEnvironment
    ? clientEnvironment.get(city)
    : request('/api/environment?' + locationParams(city), signal);
}

export async function searchCities(query: string, signal: AbortSignal): Promise<City[]> {
  if (clientEnvironment) {
    if (!/^[\p{L}\p{M}\p{N} .,'’()-]{2,64}$/u.test(query)) throw new Error('Enter a city or postcode with 2–64 characters.');
    return clientEnvironment.search(query);
  }
  return (await request<{ places: City[] }>('/api/places?q=' + encodeURIComponent(query), signal)).places;
}

export async function askSaansAI(question: string, city: City, profile: Profile, language: 'en' | 'hi', environment: Environment, signal: AbortSignal): Promise<Answer> {
  if (publicData) {
    return { ...composeAnswer(inferTopic(question), profile, environment, Math.floor(Date.now() / 1000), language), mode: 'rules', status: 'unconfigured' };
  }
  return request('/api/ask', signal, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location: { lat: city.lat, lon: city.lon }, profile, question, language }),
  });
}
