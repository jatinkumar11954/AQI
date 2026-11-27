import { z } from 'zod';
import { HOUR, type Environment } from './model.js';
import { freshAir } from './planner.js';

export const PETROL_FACTOR = 2.34;
export const scenarioBounds = {
  currentKm: { min: 0, max: 500, step: 0.1 },
  alternativeKm: { min: 0, max: 500, step: 0.1 },
  days: { min: 1, max: 31, step: 1 },
  efficiency: { min: 3, max: 100, step: 0.1 },
  fuelPrice: { min: 0, max: 300, step: 0.1 },
  alternativeCost: { min: 0, max: 5000, step: 0.1 },
  households: { min: 1, max: 10_000, step: 1 },
  currentMinutes: { min: 0, max: 60, step: 1 },
  alternativeMinutes: { min: 0, max: 60, step: 1 },
} as const;

function fieldSchema(key: keyof typeof scenarioBounds) {
  const { min, max, step } = scenarioBounds[key];
  const range = z.number().min(min).max(max);
  return step === 1 ? range.int() : range;
}

export const travelScenarioSchema = z.object({
  currentKm: fieldSchema('currentKm'),
  alternativeKm: fieldSchema('alternativeKm'),
  days: fieldSchema('days'),
  efficiency: fieldSchema('efficiency'),
  fuelPrice: fieldSchema('fuelPrice'),
  alternativeCost: fieldSchema('alternativeCost'),
  households: fieldSchema('households'),
});
export const scenarioSchema = travelScenarioSchema.extend({
  currentMinutes: fieldSchema('currentMinutes'),
  alternativeMinutes: fieldSchema('alternativeMinutes'),
});
export type Scenario = z.infer<typeof scenarioSchema>;
export const DEFAULT_SCENARIO: Scenario = {
  currentKm: 18, alternativeKm: 8, days: 8, efficiency: 15,
  fuelPrice: 100, alternativeCost: 0, households: 25, currentMinutes: 25, alternativeMinutes: 15,
};
export function calculateImpact(input: z.infer<typeof travelScenarioSchema>) {
  const currentFuel = input.currentKm * input.days / input.efficiency;
  const alternativeFuel = input.alternativeKm * input.days / input.efficiency;
  const litres = currentFuel - alternativeFuel;
  const carbon = litres * PETROL_FACTOR;
  return {
    currentCarbon: currentFuel * PETROL_FACTOR,
    alternativeCarbon: alternativeFuel * PETROL_FACTOR,
    litres, carbon, community: carbon * input.households,
    savings: litres * input.fuelPrice - input.alternativeCost * input.days,
  };
}
export function outdoorProxy(env: Environment, now: number, time: number | undefined, minutes: number) {
  if (!freshAir(env, now) || time == null || time < now || time >= now + 24 * HOUR) return null;
  const pm = env.air?.hourly.find(point => point.time === time)?.pm25;
  return pm == null ? null : pm * minutes / 60;
}
