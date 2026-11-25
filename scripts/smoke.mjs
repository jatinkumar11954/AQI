import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

const base = new URL(process.argv[2] || 'http://127.0.0.1:4173');
async function get(path, settings) {
  const start = performance.now();
  const response = await fetch(new URL(path, base), { signal: AbortSignal.timeout(75_000), ...settings });
  const bytes = Buffer.from(await response.arrayBuffer());
  return { status: response.status, headers: response.headers, bytes, elapsed: Math.round(performance.now() - start) };
}
const home = await get('/');
assert.equal(home.status, 200);
assert.match(home.bytes.toString(), /SaansAI/);
const csp = home.headers.get('content-security-policy') || home.bytes.toString().match(/http-equiv="Content-Security-Policy" content="([^"]+)/)?.[1];
assert.match((csp || '').replaceAll('&#39;', "'"), /default-src 'self'/);
const health = await get('/api/health');
assert.deepEqual(JSON.parse(health.bytes), { status: 'ok' });
const ready = await get('/api/ready');
assert.equal(ready.status, 200);
assert.deepEqual(JSON.parse(ready.bytes), { status: 'ready' });
const coordinates = {
  Delhi: [28.61, 77.21], Mumbai: [19.08, 72.88], Bengaluru: [12.97, 77.59], Lucknow: [26.85, 80.95],
  Kolkata: [22.57, 88.36], Chennai: [13.08, 80.27],
};
const result = await Promise.all(Object.entries(coordinates).map(async ([city, [lat, lon]]) => {
  const response = await get('/api/environment?' + new URLSearchParams({ lat, lon }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const data = JSON.parse(response.bytes);
  return { city, status: response.status, airStatus: data.airStatus, stationStatus: data.stationStatus,
    station: data.station?.name, type: data.station?.kind,
    indiaAqiSource: data.india?.status ?? (data.station?.kind === 'cpcb-relay' ? data.stationStatus : 'unavailable'),
    modeledHours: data.air?.hourly?.length ?? 0, weather: Boolean(data.weather), ms: response.elapsed };
}));
console.table(result);
assert.ok(result.some(city => city.airStatus === 'fresh'), 'No fresh forecast returned from live sources');
assert.ok(result.some(city => city.stationStatus === 'fresh'), 'No fresh station returned from live sources');
const invalid = await get('/api/environment?lat=bad&lon=77.21');
assert.equal(invalid.status, 400);
assert.equal(JSON.parse(invalid.bytes).error.code, 'INVALID_LOCATION');
const place = await get('/api/places?q=Pune');
assert.equal(place.status, 200);
assert.ok(JSON.parse(place.bytes).places.some(item => item.name === 'Pune'));
const ask = await get('/api/ask', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Origin: base.origin },
  body: JSON.stringify({ question: 'How should I adjust my commute?', location: { lat: 28.61, lon: 77.21 },
    profile: { children: true, seniors: false, sensitive: false, work: 'office', commute: 'transit', workStart: 9, workEnd: 17, activity: 'play', budget: 'zero' } }),
});
assert.equal(ask.status, 200);
const answer = JSON.parse(ask.bytes);
assert.ok(['gemini', 'rules'].includes(answer.mode));
assert.ok(answer.sources.includes('activity'));
console.log('Health, readiness, browser document, invalid location, live search and assistant passed.', {
  assistant: answer.mode, assistantState: answer.status, assistantMs: ask.elapsed,
});
