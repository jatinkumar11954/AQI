import { describe, expect, it } from 'vitest';
import { dailyActions, INDOOR, SUSTAINABLE } from '../src/shared/guidance';
import { httpsOrigin } from '../src/shared/deployment';
import { CITIES, DEFAULT_PROFILE, EMPTY_ENV, HOUR, SOURCES, profileKey, sameProfile, type Environment, type Profile } from '../src/shared/model';
import {
  dateKey,
  findWindows,
  freshAir,
  futureHours,
  localHour,
  modelNow,
  nearbyParticleCaution,
  risk,
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
    expect(risk(Number.NaN)).toEqual({ label: 'Hazardous', tone: 'hazardous' });
    expect(dateKey(MIDNIGHT_IST)).toBe('2026-11-26');
    expect(dateKey(MIDNIGHT_IST - 60)).toBe('2026-11-25');
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

  it('shows no forecast hours or timed recommendations when the model feed is missing', () => {
    expect(futureHours(EMPTY_ENV, MIDNIGHT_IST, 24)).toEqual([]);
    expect(findWindows(EMPTY_ENV, DEFAULT_PROFILE, MIDNIGHT_IST)).toEqual({ lower: null, usable: null });
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

  it('chooses the earlier window when equally clean pairs arrive in reverse order', () => {
    const morning = MIDNIGHT_IST + 7 * HOUR;
    const evening = MIDNIGHT_IST + 17 * HOUR;
    const hourly = [evening, evening + HOUR, morning, morning + HOUR].map(time => ({
      time, aqi: 45, pm25: 18, pm10: 40,
    }));
    const env = makeEnv({ air: { current: { ...hourly[0], time: MIDNIGHT_IST }, hourly, fetchedAt: MIDNIGHT_IST } });
    const expected = { start: morning, end: morning + 2 * HOUR, peak: 45 };

    expect(findWindows(env, DEFAULT_PROFILE, MIDNIGHT_IST)).toEqual({ lower: expected, usable: expected });
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

  it('uses the sensitive household current AQI veto even if two future hours are cleaner', () => {
    const env = makeEnv();
    env.air!.hourly[7].aqi = 42;
    env.air!.hourly[8].aqi = 48;
    const profile = { ...DEFAULT_PROFILE, sensitive: true };
    env.air!.current!.aqi = 100;
    expect(findWindows(env, profile, MIDNIGHT_IST).usable?.peak).toBe(48);
    env.air!.current!.aqi = 101;
    expect(findWindows(env, profile, MIDNIGHT_IST)).toMatchObject({ lower: { peak: 48 }, usable: null });
    expect(findWindows(env, DEFAULT_PROFILE, MIDNIGHT_IST).usable?.peak).toBe(48);
  });

  it('keeps the whole two-hour window inside the next 24 hours', () => {
    const nextDay = MIDNIGHT_IST + 24 * HOUR;
    const start = nextDay + 7 * HOUR;
    const end = start + 2 * HOUR;
    const profile = { ...DEFAULT_PROFILE, work: 'flexible' as const };
    const hourly = [start, start + HOUR].map(time => ({ time, aqi: 40, pm25: 12, pm10: 20 }));
    for (const now of [end - 24 * HOUR - 1, end - 24 * HOUR]) {
      const env = makeEnv({ air: { hourly, current: { ...hourly[0], time: now }, fetchedAt: now } }, now);
      expect(findWindows(env, profile, now).usable).toEqual(now + 24 * HOUR < end ? null : { start, end, peak: 40 });
    }
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

  it('honors a fresh PM10-only warning from either station feed', () => {
    const env = makeEnv({ stationStatus: 'fresh', station: {
      kind: 'openaq', id: 1, name: 'PM10 monitor', owner: 'Test owner', provider: 'OpenAQ', distance: 1,
      pm25: null, pm10: { value: 155, time: MIDNIGHT_IST - 3 * HOUR },
    } });
    expect(nearbyParticleCaution(env, MIDNIGHT_IST)).toBe(true);
    expect(nearbyParticleCaution(env, MIDNIGHT_IST + 1)).toBe(false);

    env.station = {
      kind: 'cpcb-relay', name: 'PM10 relay', owner: 'Test owner', provider: 'CPCB', distance: 1,
      aqi: null, pm25Index: null, pm10Index: 101, time: MIDNIGHT_IST,
    };
    expect(nearbyParticleCaution(env, MIDNIGHT_IST)).toBe(true);
    env.station.pm10Index = 100;
    expect(nearbyParticleCaution(env, MIDNIGHT_IST)).toBe(false);
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
      expect(action.hindi?.length).toBeGreaterThan(5);
    }
    expect(CITIES.length).toBeGreaterThanOrEqual(6);
  });

  it('keeps the daily checklist IDs in order and explains missing model readings', () => {
    const actions = dailyActions(EMPTY_ENV, DEFAULT_PROFILE, MIDNIGHT_IST);
    expect(actions.map(action => action.id)).toEqual(['outdoor', 'commute', 'family', 'ventilation']);
    expect(actions[0].reason).toBe('Current model data is missing or too old to use.');
  });

  it('tailors family guidance copy separately for older adults vs children', () => {
    const seniorActions = dailyActions(makeEnv(), { ...DEFAULT_PROFILE, seniors: true }, MIDNIGHT_IST);
    const seniorFamily = seniorActions.find(item => item.id === 'family')!;
    expect(seniorFamily.title).toBe('Plan for older family members');
    expect(seniorFamily.body.toLowerCase()).not.toContain('school');
    expect(seniorFamily.body.toLowerCase()).not.toContain('outdoor play');

    const childActions = dailyActions(makeEnv(), { ...DEFAULT_PROFILE, children: true }, MIDNIGHT_IST);
    const childFamily = childActions.find(item => item.id === 'family')!;
    expect(childFamily.title).toBe('Plan for school and play');
    expect(childFamily.body.toLowerCase()).toContain('school');
    const both = dailyActions(makeEnv(), { ...DEFAULT_PROFILE, children: true, seniors: true }, MIDNIGHT_IST);
    expect(both.find(item => item.id === 'family')?.title).toBe('Plan for children and older adults');

    const sensitive = dailyActions(makeEnv(), { ...DEFAULT_PROFILE, sensitive: true }, MIDNIGHT_IST);
    expect(sensitive.find(item => item.id === 'family')?.title).toBe('Plan for sensitive family members');
  });

  const travelCases: { settings: Partial<Profile>; title: string; advice: string }[] = [
    { settings: { work: 'outdoor', commute: 'two-wheeler' }, title: 'Plan lower-exposure work breaks', advice: 'indoor breaks' },
    { settings: { work: 'flexible', commute: 'none' }, title: 'Adjust your travel routine', advice: 'an existing trip' },
    { settings: { commute: 'walk' }, title: 'Adjust your travel routine', advice: 'minimise roadside waiting' },
    { settings: { commute: 'car' }, title: 'Adjust your travel routine', advice: 'Avoid idling' },
  ];
  it.each(travelCases)('tailors $advice to $settings', ({ settings, title, advice }) => {
    const actions = dailyActions(makeEnv(), { ...DEFAULT_PROFILE, ...settings }, MIDNIGHT_IST);
    const commute = actions.find(action => action.id === 'commute');
    expect(commute).toMatchObject({ title, body: expect.stringContaining(advice) });
    expect(commute?.reason).toContain(settings.work === 'flexible' ? 'A flexible schedule' : '09:00–17:00 IST');
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

describe('profile identity and origin validation helpers', () => {
  it('compares profiles structurally and derives deterministic profile keys', () => {
    const copy: Profile = { ...DEFAULT_PROFILE };
    const edited: Profile = { ...DEFAULT_PROFILE, budget: 'low' };
    expect(sameProfile(DEFAULT_PROFILE, copy)).toBe(true);
    expect(sameProfile(DEFAULT_PROFILE, edited)).toBe(false);
    expect(profileKey(DEFAULT_PROFILE)).toBe(profileKey(copy));
    expect(profileKey(DEFAULT_PROFILE)).not.toBe(profileKey(edited));
  });

  it('validates clean HTTPS origins without paths, queries, fragments, or credentials', () => {
    expect(httpsOrigin(undefined)).toBeUndefined();
    expect(httpsOrigin('')).toBeUndefined();
    expect(httpsOrigin('https://aqi-tau.vercel.app/')).toBe('https://aqi-tau.vercel.app');
    expect(httpsOrigin('http://aqi-tau.vercel.app')).toBeUndefined();
    expect(httpsOrigin('https://aqi-tau.vercel.app/subpath')).toBeUndefined();
    expect(httpsOrigin('https://user:pass@aqi-tau.vercel.app')).toBeUndefined();
    expect(httpsOrigin('not a valid url')).toBeUndefined();
  });
});
