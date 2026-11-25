import { EMPTY_ENV, HOUR, type Environment } from '../src/shared/model';

export const NOW = Date.parse('2026-11-26T01:00:00Z') / 1000;
export const FIRST = NOW + HOUR;
const areas = [92, 77, 47, 42, 59, 134, 290, 210, 170, 130, 108, 85, 86];
export function modeled(now = NOW): Environment {
  return {
    ...EMPTY_ENV, airStatus: 'fresh',
    air: {
      fetchedAt: now, current: { time: now, aqi: 82, pm25: 26, pm10: 58 },
      hourly: areas.map((aqi, n) => ({ time: now + (n + 1) * HOUR, aqi, pm25: aqi / 2, pm10: aqi + 20 })),
    },
    weather: { time: now, temperature: 24, humidity: 62, wind: 8 },
  };
}
export function providerAir(now = NOW) {
  const env = modeled(now).air!;
  return {
    current: { time: now, us_aqi: 82, pm2_5: 26, pm10: 58 },
    hourly: {
      time: env.hourly.map(row => row.time), us_aqi: env.hourly.map(row => row.aqi),
      pm2_5: env.hourly.map(row => row.pm25), pm10: env.hourly.map(row => row.pm10),
    },
  };
}
export function relayPayload() {
  return { data: [{
    station: 'Reference test station', updated: '2026-11-26 06:00', distance_km: 2,
    aqi: 123, pollutants: { 'PM2.5': { avg: 123 }, PM10: { avg: 120 } },
  }] };
}
