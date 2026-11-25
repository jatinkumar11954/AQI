import { describe, expect, it } from 'vitest';
import { CITIES, DEFAULT_PROFILE, EMPTY_ENV, HOUR, SOURCES, type Environment } from '../src/shared/model';
import {
  dailyActions,
  findWindows,
  freshAir,
  INDOOR,
  localHour,
  modelNow,
  nearbyParticleCaution,
  risk,
  SUSTAINABLE,
  ventilation,
} from '../src/shared/planner';

// 2026-11-26T00:00:00+05:30 (midnight IST)
const MIDNIGHT_IST = 1795631400;

function makeEnv(overrides: Partial<Environment> = {}, now = MIDNIGHT_IST): Environment {
  const hourly = Array.from({ length: 24 }, (_, idx) => ({
    time: now + idx * HOUR,
    aqi: 70,
    pm25: 18,
    pm10: 40,
  }));
  return {
    ...EMPTY_ENV,
    airStatus: 'fresh',
    air: {
      current: { time: now, aqi: 75, pm25: 20, pm10: 42 },
      hourly,
      fetchedAt: now,
    },
    weather: { time: now, temperature: 24, humidity: 55, wind: 8 },
    ...overrides,
  };
}

describe('planner risk and time helpers', () => {
  it('maps US AQI boundaries accurately', () => {
    expect(risk(null)).toEqual({ label: 'Unavailable', tone: 'unknown' });
    expect(risk(0).tone).toBe('good');
    expect(risk(50).tone).toBe('good');
    expect(risk(51).tone).toBe('moderate');
    expect(risk(100).tone).toBe('moderate');
    expect(risk(150).tone).toBe('sensitive');
    expect(risk(200).tone).toBe('unhealthy');
    expect(risk(300).tone).toBe('very-unhealthy');
    expect(risk(301).tone).toBe('hazardous');
  });

  it('rejects stale or future-drifted model data', () => {
    const staleStatus = makeEnv({ airStatus: 'stale' });
    expect(freshAir(staleStatus, MIDNIGHT_IST)).toBeNull();
    expect(modelNow(staleStatus, MIDNIGHT_IST)).toBeNull();

    const expiredFetch = makeEnv();
    expiredFetch.air!.fetchedAt = MIDNIGHT_IST - HOUR - 1;
    expect(freshAir(expiredFetch, MIDNIGHT_IST)).toBeNull();

    const driftedCurrent = makeEnv();
    driftedCurrent.air!.current!.time = MIDNIGHT_IST + 901;
    expect(modelNow(driftedCurrent, MIDNIGHT_IST)).toBeNull();
  });
});

describe('findWindows and nearbyParticleCaution', () => {
  it('selects cleaner daytime hours outside office work schedule', () => {
    const env = makeEnv();
    env.air!.hourly[7].aqi = 42;
    env.air!.hourly[8].aqi = 48;
    const { lower, usable } = findWindows(env, DEFAULT_PROFILE, MIDNIGHT_IST);
    expect(lower).not.toBeNull();
    expect(usable).not.toBeNull();
    expect(localHour(usable!.start)).toBe(7);
    expect(usable!.peak).toBe(48);
  });

  it('enforces stricter ceiling (<= 50) for sensitive households and non-errand activity', () => {
    const env = makeEnv();
    const standard = findWindows(env, DEFAULT_PROFILE, MIDNIGHT_IST);
    expect(standard.usable).not.toBeNull();

    const sensitive = findWindows(env, { ...DEFAULT_PROFILE, children: true }, MIDNIGHT_IST);
    expect(sensitive.lower).not.toBeNull();
    expect(sensitive.usable).toBeNull();

    const exercise = findWindows(env, { ...DEFAULT_PROFILE, activity: 'exercise' }, MIDNIGHT_IST);
    expect(exercise.usable).toBeNull();
  });

  it('supports overnight work blocks and blocks outings on high AQI or station caution', () => {
    const env = makeEnv();
    env.air!.hourly[10].aqi = 35;
    env.air!.hourly[11].aqi = 38;
    const overnight = { ...DEFAULT_PROFILE, workStart: 22, workEnd: 6 };
    const result = findWindows(env, overnight, MIDNIGHT_IST);
    expect(result.usable).not.toBeNull();
    expect(localHour(result.usable!.start)).toBe(10);

    env.air!.current!.aqi = 240;
    expect(findWindows(env, overnight, MIDNIGHT_IST).usable).toBeNull();

    // OpenAQ station caution via fresh PM2.5 >= 35.5
    env.air!.current!.aqi = 75;
    env.stationStatus = 'fresh';
    const openaqStation = {
      kind: 'openaq' as const,
      id: 101,
      name: 'DTU Delhi',
      owner: 'CPCB',
      provider: 'CPCB',
      distance: 4.2,
      pm25: { value: 42, time: MIDNIGHT_IST - 600 },
      pm10: null,
    };
    env.station = openaqStation;
    expect(nearbyParticleCaution(env, MIDNIGHT_IST)).toBe(true);
    expect(findWindows(env, overnight, MIDNIGHT_IST).usable).toBeNull();

    // Stale OpenAQ reading (>3h) does not trigger caution
    openaqStation.pm25.time = MIDNIGHT_IST - 4 * HOUR;
    expect(nearbyParticleCaution(env, MIDNIGHT_IST)).toBe(false);

    // CPCB relay station caution via sub-index >= 101
    env.station = {
      kind: 'cpcb-relay',
      name: 'Anand Vihar',
      owner: 'CPCB monitoring network',
      provider: 'India API / data.gov.in',
      distance: 3.1,
      aqi: 145,
      time: MIDNIGHT_IST - 900,
      pm25Index: 145,
      pm10Index: 112,
    };
    expect(nearbyParticleCaution(env, MIDNIGHT_IST)).toBe(true);
    expect(findWindows(env, overnight, MIDNIGHT_IST).usable).toBeNull();
  });
});

describe('ventilation, dailyActions, and catalog sources', () => {
  it('checks air quality and temperature thresholds before suggesting ventilation', () => {
    const env = makeEnv();
    expect(ventilation(env, DEFAULT_PROFILE, MIDNIGHT_IST).title).toContain('Check conditions');

    const tooHot = makeEnv({ weather: { time: MIDNIGHT_IST, temperature: 36, humidity: 40, wind: 5 } });
    expect(ventilation(tooHot, DEFAULT_PROFILE, MIDNIGHT_IST).title).toContain('Be cautious');

    const sensitive = ventilation(env, { ...DEFAULT_PROFILE, seniors: true }, MIDNIGHT_IST);
    expect(sensitive.title).toContain('Be cautious');
  });

  it('produces valid source IDs and Hindi tips across all household actions', () => {
    const actions = dailyActions(makeEnv(), DEFAULT_PROFILE, MIDNIGHT_IST);
    expect(actions).toHaveLength(4);
    for (const action of [...actions, ...INDOOR.zero, ...INDOOR.low, ...INDOOR.premium, ...SUSTAINABLE]) {
      expect(SOURCES[action.source]).toBeDefined();
      expect(action.title.length).toBeGreaterThan(3);
      expect(action.body.length).toBeGreaterThan(10);
    }
    expect(CITIES.length).toBeGreaterThanOrEqual(6);
  });
});

it('uses a fresh India-scale station AQI to veto outdoor advice even when OpenAQ PM is low', () => {
  const env = makeEnv();
  env.stationStatus = 'fresh';
  env.station = {
    kind: 'openaq', id: 42, name: 'OpenAQ', owner: 'Test owner', provider: 'OpenAQ', distance: 1,
    pm25: { value: 10, time: MIDNIGHT_IST }, pm10: null,
  };
  env.india = {
    status: 'fresh',
    station: {
      kind: 'cpcb-relay', name: 'CPCB relay', owner: 'Test owner', provider: 'Relay', distance: 2,
      aqi: 410, time: MIDNIGHT_IST, pm25Index: 410, pm10Index: null,
    },
  };
  expect(nearbyParticleCaution(env, MIDNIGHT_IST)).toBe(true);
  expect(findWindows(env, DEFAULT_PROFILE, MIDNIGHT_IST).usable).toBeNull();
  env.india.status = 'stale';
  expect(nearbyParticleCaution(env, MIDNIGHT_IST)).toBe(false);
});
