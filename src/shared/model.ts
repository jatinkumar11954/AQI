import { z } from 'zod';

// Keep validation compatible with the browser's strict script policy.
z.config({ jitless: true });

export const HOUR = 3600;
/** Maximum age in seconds before ground-station readings are considered stale. */
export const OBSERVATION_MAX_AGE = 3 * HOUR;
export const TIMEZONE = 'Asia/Kolkata';
export const latitude = z.number().min(6).max(38);
export const longitude = z.number().min(67).max(98);
export const pointSchema = z.object({ lat: latitude, lon: longitude });
export const citySchema = pointSchema.extend({ name: z.string().trim().min(1).max(100), state: z.string().max(100) });
export const citySearchSchema = z.string().trim().min(2).max(64).regex(/^[\p{L}\p{M}\p{N} .,'’()-]+$/u);
export const searchResponseSchema = z.object({ places: z.array(citySchema).max(20) });
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

const profileFields = profileSchema.keyof().options;

/** Returns a stable string key representing every field of a validated household profile. */
export function profileKey(profile: Profile): string {
  return profileFields.map(field => profile[field]).join(':');
}

export function sameProfile(a: Profile, b: Profile): boolean {
  return profileFields.every(field => a[field] === b[field]);
}

export const airTimestamp = z.number().int().min(1_500_000_000).max(4_100_000_000);
export const concentration = z.number().nonnegative();
export const modeledAqi = z.number().int().min(0).max(5000);
const airPointSchema = z.object({
  time: airTimestamp,
  aqi: modeledAqi.nullable(),
  pm25: concentration.nullable(),
  pm10: concentration.nullable(),
});
export type AirPoint = z.infer<typeof airPointSchema>;
const weatherSchema = z.object({
  time: airTimestamp,
  temperature: z.number().nullable(),
  humidity: concentration.nullable(),
  wind: concentration.nullable(),
});
export type Weather = z.infer<typeof weatherSchema>;
const readingSchema = z.object({ value: concentration, time: airTimestamp });
export type Reading = z.infer<typeof readingSchema>;
const stationFields = z.object({
  name: z.string(),
  owner: z.string(),
  provider: z.string(),
  distance: z.number().min(0).max(25),
});
const indiaIndex = z.number().min(0).max(500).nullable();
const indiaStationSchema = stationFields.extend({
  kind: z.literal('cpcb-relay'),
  time: airTimestamp,
  aqi: indiaIndex,
  pm25Index: indiaIndex,
  pm10Index: indiaIndex,
});
export type IndiaStation = z.infer<typeof indiaStationSchema>;
const stationSchema = z.discriminatedUnion('kind', [
  indiaStationSchema,
  stationFields.extend({
    kind: z.literal('openaq'),
    id: z.number().int().positive(),
    pm25: readingSchema.nullable(),
    pm10: readingSchema.nullable(),
  }),
]);
export type Station = z.infer<typeof stationSchema>;
const feedStatus = z.enum(['fresh', 'stale', 'unavailable']);
export const environmentSchema = z.object({
  air: z.object({
    current: airPointSchema.nullable(),
    hourly: z.array(airPointSchema).max(96),
    fetchedAt: airTimestamp,
  }).nullable(),
  airStatus: feedStatus,
  weather: weatherSchema.nullable(),
  station: stationSchema.nullable(),
  stationStatus: feedStatus.or(z.enum(['unconfigured', 'no-station'])),
  india: z.object({ station: indiaStationSchema, status: z.enum(['fresh', 'stale']) }).optional(),
});
export type Environment = z.infer<typeof environmentSchema>;
export const EMPTY_ENV: Environment = {
  air: null,
  airStatus: 'unavailable',
  weather: null,
  station: null,
  stationStatus: 'unconfigured',
};

export const SOURCE_IDS = [
  'aqi',
  'activity',
  'clean',
  'cooking',
  'filter',
  'openaq',
  'relay',
  'cpcb',
  'model',
  'weather',
  'fuel',
] as const;
export type SourceId = typeof SOURCE_IDS[number];
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
} as const satisfies Record<SourceId, { title: string; url: string }>;

export const answerSchema = z.object({
  mode: z.enum(['gemini', 'rules']),
  text: z.string(),
  context: z.string(),
  sources: z.enum(SOURCE_IDS).array(),
  status: z.enum(['unconfigured', 'quota', 'unavailable', 'privacy']).optional(),
  followUp: z.string().optional(),
});
export type Answer = z.infer<typeof answerSchema>;
