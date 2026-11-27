import { describe, expect, it } from 'vitest';
import { EMPTY_ENV, HOUR, type Environment } from '../src/shared/model';
import { calculateImpact, DEFAULT_SCENARIO, outdoorProxy, PETROL_FACTOR, scenarioSchema, travelScenarioSchema } from '../src/shared/impact';

const NOW = 1795631400;

describe('impact simulator calculations and validation', () => {
  it('calculates petrol savings, CO2 reduction, cost savings, and community scale', () => {
    const impact = calculateImpact(DEFAULT_SCENARIO);
    // (18 - 8) * 8 / 15 = 5.3333... L saved
    expect(impact.litres).toBeCloseTo(16 / 3, 6);
    expect(impact.carbon).toBeCloseTo((16 / 3) * PETROL_FACTOR, 6);
    expect(impact.community).toBeCloseTo(impact.carbon * DEFAULT_SCENARIO.households, 6);
    expect(impact.savings).toBeCloseTo((16 / 3) * 100, 6);
  });

  it('handles negative net savings when extra transit fares exceed fuel savings', () => {
    const impact = calculateImpact({
      ...DEFAULT_SCENARIO,
      currentKm: 5,
      alternativeKm: 4,
      days: 10,
      efficiency: 20,
      fuelPrice: 100,
      alternativeCost: 80,
    });
    // 0.5 L saved * 100 = 50 fuel saved - 800 extra fare = -750
    expect(impact.savings).toBe(-750);
  });

  it('preserves the sign for additional fuel use and household emissions', () => {
    const scenario = travelScenarioSchema.parse({ ...DEFAULT_SCENARIO, currentKm: 0, alternativeKm: 15 });
    const impact = calculateImpact(scenario);
    expect(impact.currentCarbon).toBe(0);
    expect(impact.litres).toBe(-8);
    expect(impact.carbon).toBeCloseTo(-8 * PETROL_FACTOR);
    expect(impact.community).toBeCloseTo(-8 * PETROL_FACTOR * scenario.households);
  });

  it('enforces scenarioSchema bounds and integer constraints', () => {
    expect(scenarioSchema.safeParse(DEFAULT_SCENARIO).success).toBe(true);
    expect(scenarioSchema.safeParse({ ...DEFAULT_SCENARIO, efficiency: 2 }).success).toBe(false);
    expect(scenarioSchema.safeParse({ ...DEFAULT_SCENARIO, days: 1.5 }).success).toBe(false);
    expect(scenarioSchema.safeParse({ ...DEFAULT_SCENARIO, days: 32 }).success).toBe(false);
    expect(scenarioSchema.safeParse({ ...DEFAULT_SCENARIO, households: 0 }).success).toBe(false);
    expect(scenarioSchema.safeParse({ ...DEFAULT_SCENARIO, currentMinutes: 61 }).success).toBe(false);
    expect(scenarioSchema.safeParse({ ...DEFAULT_SCENARIO, alternativeMinutes: 12.5 }).success).toBe(false);
    expect(travelScenarioSchema.parse({ ...DEFAULT_SCENARIO, currentMinutes: -1 }).households).toBe(25);
  });

  it('computes outdoor PM2.5 proxy only for fresh forecast hours within 24h', () => {
    const env: Environment = {
      ...EMPTY_ENV,
      airStatus: 'fresh',
      air: {
        current: { time: NOW, aqi: 80, pm25: 25, pm10: 50 },
        hourly: [
          { time: NOW + HOUR, aqi: 90, pm25: 30, pm10: 60 },
          { time: NOW + 2 * HOUR, aqi: 70, pm25: null, pm10: 40 },
          { time: NOW + 24 * HOUR, aqi: 40, pm25: 10, pm10: 20 },
        ],
        fetchedAt: NOW,
      },
    };
    expect(outdoorProxy(env, NOW, NOW + HOUR, 30)).toBe(15);
    expect(outdoorProxy(env, NOW, NOW + 24 * HOUR, 30)).toBeNull();
    expect(outdoorProxy({ ...env, airStatus: 'stale' }, NOW, NOW + HOUR, 30)).toBeNull();
    expect(outdoorProxy(env, NOW, undefined, 30)).toBeNull();
    expect(outdoorProxy(env, NOW, NOW - HOUR, 30)).toBeNull();
    expect(outdoorProxy(env, NOW, NOW + 2 * HOUR, 30)).toBeNull();
    expect(outdoorProxy(env, NOW, NOW + 3 * HOUR, 30)).toBeNull();
    expect(outdoorProxy(env, NOW, NOW + HOUR, 0)).toBe(0);
  });
});
