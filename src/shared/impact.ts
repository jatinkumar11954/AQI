import { z } from 'zod';
import { HOUR, type Environment } from './model';
import { freshAir } from './planner';

export const PETROL_FACTOR = 2.34;
const bounded = (min: number, max: number) => z.number().min(min).max(max);
export const scenarioSchema = z.object({
  currentKm: bounded(0, 500), alternativeKm: bounded(0, 500), days: bounded(1, 31).int(),
  efficiency: bounded(3, 100), fuelPrice: bounded(0, 300), alternativeCost: bounded(0, 5000),
  households: bounded(1, 10000).int(), currentMinutes: bounded(0, 60), alternativeMinutes: bounded(0, 60),
});
export type Scenario = z.infer<typeof scenarioSchema>;
export const DEFAULT_SCENARIO: Scenario = {
  currentKm: 18, alternativeKm: 8, days: 8, efficiency: 15,
  fuelPrice: 100, alternativeCost: 0, households: 25, currentMinutes: 25, alternativeMinutes: 15,
};
export function calculateImpact(input: Scenario) {
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
