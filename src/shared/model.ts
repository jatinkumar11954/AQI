import { z } from 'zod';

export const HOUR = 3600;
export const TIMEZONE = 'Asia/Kolkata';
export const latitude = z.number().min(6).max(38);
export const longitude = z.number().min(67).max(98);
export const pointSchema = z.object({ lat: latitude, lon: longitude });
export const citySchema = pointSchema.extend({ name: z.string().trim().min(1).max(100), state: z.string().max(100) });
export type City = z.infer<typeof citySchema>;
export const CITIES: City[] = [
  { name: 'New Delhi', state: 'Delhi', lat: 28.61, lon: 77.21 },
  { name: 'Mumbai', state: 'Maharashtra', lat: 19.08, lon: 72.88 },
  { name: 'Bengaluru', state: 'Karnataka', lat: 12.97, lon: 77.59 },
  { name: 'Lucknow', state: 'Uttar Pradesh', lat: 26.85, lon: 80.95 },
  { name: 'Kolkata', state: 'West Bengal', lat: 22.57, lon: 88.36 },
  { name: 'Chennai', state: 'Tamil Nadu', lat: 13.08, lon: 80.27 },
];
export const budgetSchema = z.enum(['zero', 'low', 'premium']);
export const profileSchema = z.object({
  children: z.boolean(), seniors: z.boolean(), sensitive: z.boolean(),
  work: z.enum(['office', 'outdoor', 'remote', 'flexible']),
  commute: z.enum(['car', 'two-wheeler', 'transit', 'walk', 'none']),
  workStart: z.number().int().min(0).max(23), workEnd: z.number().int().min(0).max(23),
  activity: z.enum(['errands', 'exercise', 'play']),
  budget: budgetSchema,
}).strict();
export type Profile = z.infer<typeof profileSchema>;
export const DEFAULT_PROFILE: Profile = {
  children: false, seniors: false, sensitive: false, work: 'office', commute: 'transit',
  workStart: 9, workEnd: 17, activity: 'errands', budget: 'zero',
};
export const PROFILES: { name: string; description: string; city: City; profile: Profile }[] = [
  { name: 'School-day household', description: 'New Delhi · Child · Metro or bus', city: CITIES[0],
    profile: { ...DEFAULT_PROFILE, children: true, activity: 'play' } },
  { name: 'Senior at home', description: 'Lucknow · Older adult · Flexible schedule', city: CITIES[3],
    profile: { ...DEFAULT_PROFILE, seniors: true, work: 'flexible', commute: 'none', activity: 'exercise', budget: 'low' } },
  { name: 'Outdoor worker', description: 'Mumbai · Two-wheeler · Early shift', city: CITIES[1],
    profile: { ...DEFAULT_PROFILE, work: 'outdoor', commute: 'two-wheeler', workStart: 7, workEnd: 15 } },
];

export type AirPoint = { time: number; aqi: number | null; pm25: number | null; pm10: number | null };
export type Weather = { time: number; temperature: number | null; humidity: number | null; wind: number | null };
export type Reading = { value: number; time: number };
export type Station = {
  name: string; owner: string; provider: string; distance: number;
} & (
  | { kind: 'openaq'; id: number; pm25: Reading | null; pm10: Reading | null }
  | { kind: 'cpcb-relay'; aqi: number | null; time: number; pm25Index: number | null; pm10Index: number | null }
);
export type FeedStatus = 'fresh' | 'stale' | 'unavailable';
export type Environment = {
  air: { current: AirPoint | null; hourly: AirPoint[]; fetchedAt: number } | null;
  airStatus: FeedStatus;
  weather: Weather | null;
  station: Station | null;
  stationStatus: FeedStatus | 'unconfigured' | 'no-station';
};
export const EMPTY_ENV: Environment = { air: null, airStatus: 'unavailable', weather: null, station: null, stationStatus: 'unconfigured' };

export const SOURCES = {
  aqi: { title: 'AirNow · US AQI scale', url: 'https://smoke.airnow.gov/aqi/aqi-basics/' },
  activity: { title: 'AirNow · Particle pollution activity guide', url: 'https://document.airnow.gov/air-quality-guide-for-particle-pollution.pdf' },
  clean: { title: 'US EPA · Cleaner indoor air during smoke', url: 'https://www.epa.gov/emergencies-iaq/create-clean-room-protect-indoor-air-quality-during-wildfire' },
  cooking: { title: 'US EPA · Cooking and indoor air', url: 'https://www.epa.gov/indoor-air-quality-iaq/strategies-improving-indoor-air-quality-while-cooking-infographic' },
  filter: { title: 'US EPA · Home air cleaners', url: 'https://www.epa.gov/indoor-air-quality-iaq/guide-air-cleaners-home' },
  openaq: { title: 'OpenAQ · Station measurements', url: 'https://explore.openaq.org/' },
  relay: { title: 'India API · CPCB data relay', url: 'https://api.dharun.dev/docs/air-quality' },
  cpcb: { title: 'CPCB · India National AQI', url: 'https://airquality.cpcb.gov.in/AQI_India/' },
  model: { title: 'Open-Meteo · CAMS air quality', url: 'https://open-meteo.com/en/docs/air-quality-api' },
  weather: { title: 'Open-Meteo · Weather', url: 'https://open-meteo.com/en/docs' },
  fuel: { title: 'UK DESNZ · DUKES 2026 Annex A', url: 'https://www.gov.uk/government/statistics/digest-of-uk-energy-statistics-dukes-2026' },
} as const;
export type SourceId = keyof typeof SOURCES;
