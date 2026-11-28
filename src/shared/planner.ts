import { HOUR, OBSERVATION_MAX_AGE, TIMEZONE, type AirPoint, type Environment, type Profile, type SourceId } from './model.js';

const thresholds = [
  [50, 'Good', 'good'], [100, 'Moderate', 'moderate'],
  [150, 'Unhealthy for sensitive groups', 'sensitive'], [200, 'Unhealthy', 'unhealthy'],
  [300, 'Very unhealthy', 'very-unhealthy'], [Infinity, 'Hazardous', 'hazardous'],
] as const;

/** Maps a US AQI value to its display category label and tone token. */
export function risk(aqi: number | null | undefined) {
  if (aqi == null) return { label: 'Unavailable', tone: 'unknown' };
  const [, label, tone] = thresholds.find(([max]) => aqi <= max) ?? thresholds[5];
  return { label, tone };
}

const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: TIMEZONE });
const clock = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: TIMEZONE });
const hour = new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: TIMEZONE });
const isoDate = new Intl.DateTimeFormat('en-CA', { dateStyle: 'short', timeZone: TIMEZONE });
export const formatTime = (seconds: number) => clock.format(seconds * 1000);
export const formatDate = (seconds: number) => date.format(seconds * 1000);
export const localHour = (seconds: number) => Number(hour.format(seconds * 1000));
export const dateKey = (seconds: number) => isoDate.format(seconds * 1000);
export const isSensitive = (profile: Profile) => profile.children || profile.seniors || profile.sensitive;

/** Returns the air forecast feed only when marked fresh and fetched within the last hour. */
export function freshAir(env: Environment, now: number) {
  if (env.airStatus !== 'fresh' || !env.air || now - env.air.fetchedAt > HOUR) return null;
  return env.air;
}

/** Returns the current modeled air snapshot when fresh and aligned to the current hour window. */
export function modelNow(env: Environment, now: number) {
  const current = freshAir(env, now)?.current;
  return current && now - current.time <= 2 * HOUR && current.time <= now + 900 ? current : null;
}

/** Filters future hourly forecast points starting at `now` for `within` hours ahead. */
export function futureHours(env: Environment, now: number, within: number) {
  return (env.air?.hourly ?? []).filter(point => point.time >= now && point.time < now + within * HOUR);
}

type Window = { start: number; end: number; peak: number };
function atWork(profile: Profile, h: number) {
  if (profile.work === 'flexible' || profile.workStart === profile.workEnd) return false;
  if (profile.workStart < profile.workEnd) return h >= profile.workStart && h < profile.workEnd;
  return h >= profile.workStart || h < profile.workEnd;
}

/** Returns the India CPCB relay station record if fresh within `OBSERVATION_MAX_AGE`. */
export function freshIndiaStation(env: Environment, now: number) {
  const station = env.station?.kind === 'cpcb-relay' && env.stationStatus === 'fresh' ? env.station
    : env.india?.status === 'fresh' ? env.india.station : null;
  return station && station.time <= now + 300 && now - station.time <= OBSERVATION_MAX_AGE ? station : null;
}

/** Flags elevated fresh ground-station readings (CPCB index >= 101 or elevated OpenAQ PM) that veto outdoor windows. */
export function nearbyParticleCaution(env: Environment, now: number) {
  const india = freshIndiaStation(env, now);
  if (india && Math.max(india.aqi ?? 0, india.pm25Index ?? 0, india.pm10Index ?? 0) >= 101) return true;
  if (env.stationStatus !== 'fresh' || env.station?.kind !== 'openaq') return false;
  const { pm25, pm10 } = env.station;
  // A conservative conflict screen. These single readings never produce an AQI.
  return Boolean((pm25 && now - pm25.time <= OBSERVATION_MAX_AGE && pm25.value >= 35.5)
    || (pm10 && now - pm10.time <= OBSERVATION_MAX_AGE && pm10.value >= 155));
}

/** Finds the lowest-AQI 2-hour daytime window and determines whether it satisfies household safety criteria. */
export function findWindows(env: Environment, profile: Profile, now: number) {
  const none = { lower: null, usable: null };
  if (!freshAir(env, now)) return none;
  const ceiling = isSensitive(profile) || profile.activity !== 'errands' ? 50 : 100;
  const hours = futureHours(env, now, 24);
  const candidates: Window[] = [];
  const eligible = (point: AirPoint): point is AirPoint & { aqi: number } => {
    const h = localHour(point.time);
    const endHour = localHour(point.time + HOUR - 1);
    return point.aqi != null && h >= 7 && endHour < 20 && !atWork(profile, h) && !atWork(profile, endHour);
  };
  for (let index = 1; index < hours.length; index++) {
    const earlier = hours[index - 1];
    const later = hours[index];
    const end = later.time + HOUR;
    if (end > now + 24 * HOUR || later.time - earlier.time !== HOUR || !eligible(earlier) || !eligible(later)) continue;
    candidates.push({ start: earlier.time, end, peak: Math.max(earlier.aqi, later.aqi) });
  }
  candidates.sort((a, b) => a.peak - b.peak || a.start - b.start);
  const lower = candidates[0] ?? null;
  const current = modelNow(env, now)?.aqi;
  // Don't promote an outing during a currently hazardous episode or conflicting monitor readings.
  const usable = lower && lower.peak <= ceiling && current != null && current <= (isSensitive(profile) ? 100 : 150)
    && !nearbyParticleCaution(env, now) ? lower : null;
  return { lower, usable };
}

export type Action = {
  id: string;
  title: string;
  body: string;
  reason: string;
  tradeoff: string;
  source: SourceId;
  hindi?: string;
};

export const INDOOR: Record<'zero' | 'low' | 'premium', Action[]> = {
  zero: [
    {
      id: 'smoke',
      title: 'Reduce smoke at the source',
      body: 'Keep tobacco smoke, incense and coils out of living spaces. Choose a damp cloth or mop over dry dusting.',
      reason: 'Source control comes before filtration.',
      tradeoff: 'Damp cleaning takes time and cannot remove outdoor smoke that enters the home.',
      source: 'clean',
      hindi: 'घर के अंदर धुआँ कम करें। धूल को गीले कपड़े से साफ़ करें।',
    },
    {
      id: 'cooking',
      title: 'Use kitchen exhaust while cooking',
      body: 'Use an outside-vented hood or kitchen exhaust if available. Use back burners when the hood covers them better, and avoid charring food.',
      reason: 'Cooking produces particles even in a home without tobacco smoke.',
      tradeoff: 'An exhaust fan only helps if it vents outdoors. Follow appliance safety instructions.',
      source: 'cooking',
      hindi: 'खाना बनाते समय बाहर की ओर जाने वाला एग्ज़ॉस्ट चलाएँ।',
    },
  ],
  low: [
    {
      id: 'maintain',
      title: 'Maintain the equipment you have',
      body: 'Clean the hood’s grease filter as directed. Replace a portable cleaner’s filter on schedule and check replacement costs before buying.',
      reason: 'Maintenance keeps a usable setup in service.',
      tradeoff: 'Replacement filters cost money. Check the manual for which filters can be washed.',
      source: 'filter',
      hindi: 'मौजूदा फ़िल्टर की सफ़ाई और बदलने का समय जाँचें।',
    },
  ],
  premium: [
    {
      id: 'hepa',
      title: 'Filter the room you use most',
      body: 'Choose a mechanical HEPA purifier with a clean air delivery rate sized for the room. Avoid ozone generators and include replacement filters in your budget.',
      reason: 'A room-sized unit targets airborne particles in the space where it runs.',
      tradeoff: 'It costs money to run and maintain. A particle filter does not remove every gas.',
      source: 'filter',
      hindi: 'कमरे के आकार के अनुसार HEPA फ़िल्टर चुनें।',
    },
  ],
};

export const SUSTAINABLE: Action[] = [
  {
    id: 'combine',
    title: 'Combine petrol trips',
    body: 'Group errands or use a nearby pickup point where practical. Skip a trip outright when remote work or a shared pickup is already available.',
    reason: 'Fewer petrol kilometres generally mean less fuel burned. Use the simulator to compare your own routine.',
    tradeoff: 'Combining stops can take longer. Compare the actual distance and avoid extra roadside waiting during high pollution.',
    source: 'fuel',
    hindi: 'कई छोटे चक्करों के बजाय काम एक साथ निपटाकर पेट्रोल सफ़र कम करें।',
  },
  {
    id: 'transit',
    title: 'Compare Metro, bus and shared rides',
    body: 'Check fares, transfers and time spent near traffic. On polluted days favour a feasible option with less outdoor waiting and exertion.',
    reason: 'A lower-emission commute can still involve roadside exposure.',
    tradeoff: 'Fares, waiting time and transfers vary. Avoid a more exposed route just to reduce fuel use.',
    source: 'activity',
    hindi: 'प्रदूषित दिनों में कम प्रतीक्षा और ढके हुए सफ़र का विकल्प चुनें।',
  },
  {
    id: 'lower-heat',
    title: 'Cook with less smoke',
    body: 'Avoid burning food and use lower heat where the recipe allows. Use the exhaust even if you also use a purifier.',
    reason: 'Keeping cooking emissions low reduces the amount that needs to be removed.',
    tradeoff: 'Use the heat needed to cook food safely. Exhaust still matters when the air looks clear.',
    source: 'cooking',
    hindi: 'खाना धीमी आँच पर पकाएँ और धुआँ न बढ़ने दें।',
  },
  {
    id: 'community',
    title: 'Coordinate in your building',
    body: 'Agree on no-idling pickups and avoid burning leaves or waste. Share official monitoring links and indoor alternatives with neighbours.',
    reason: 'This targets sources in shared spaces without requiring each household to buy equipment.',
    tradeoff: 'Shared practices depend on neighbours taking part and do not remove pollution from outside the area.',
    source: 'clean',
    hindi: 'इमारत में गाड़ी बेकार न खड़ी रखने और कचरा न जलाने पर सहमति बनाएँ।',
  },
];

function isComfortTemperature(env: Environment, now: number): boolean {
  const weather = env.weather;
  return weather?.temperature != null
    && now - weather.time <= 2 * HOUR
    && weather.temperature >= 18
    && weather.temperature <= 32;
}

/** Recommends cautious or conservative window-opening guidance based on air quality and comfort temperatures. */
export function ventilation(env: Environment, profile: Profile, now: number): Action {
  const aqi = modelNow(env, now)?.aqi;
  const maxAllowedAqi = isSensitive(profile) ? 50 : 100;
  const okay = aqi != null
    && aqi <= maxAllowedAqi
    && !nearbyParticleCaution(env, now)
    && isComfortTemperature(env, now);
  return {
    id: 'ventilation',
    title: okay ? 'Check conditions before airing the room' : 'Be cautious about opening windows',
    body: okay
      ? 'If outdoor air looks and smells clear, local advisories allow it and the room needs fresh air, try a brief opening away from traffic. Close up if conditions worsen.'
      : 'When outdoor smoke is high, limit unnecessary window opening if the room can stay comfortable. Use safe, outside-vented kitchen exhaust where available. Follow local advice, especially if the room overheats or has combustion fumes.',
    reason: okay
      ? 'The current model and temperature passed this app’s conservative screen. Conditions can differ on your street.'
      : 'Pollution, conflicting station readings, temperature or missing data can make a window-opening suggestion inappropriate.',
    tradeoff: 'Closing windows can trap heat or indoor fumes. Follow building and appliance safety guidance.',
    source: 'clean',
    hindi: 'खिड़की खोलने से पहले बाहर की हवा और कमरे की गर्मी जाँचें।',
  };
}

function commuteGuidance(profile: Profile): string {
  if (profile.work === 'outdoor') {
    return 'For unavoidable outdoor work, discuss lower-exposure tasks, indoor breaks and your workplace’s protective guidance.';
  }
  if (profile.commute === 'none' || profile.work === 'remote') {
    return 'Bundle a necessary errand with an existing trip or use a remote option where possible.';
  }
  if (profile.commute === 'walk' || profile.commute === 'two-wheeler') {
    return 'If local pollution is high, consider a practical covered ride when available and minimise roadside waiting.';
  }
  if (profile.commute === 'car') {
    return 'Group pickups and errands where feasible. Avoid idling while you wait.';
  }
  return 'If you need to travel, keep outside waiting short when pollution rises.';
}

function familyTitle(profile: Profile): string {
  if (profile.children && profile.seniors) return 'Plan for children and older adults';
  if (profile.children) return 'Plan for school and play';
  if (profile.seniors) return 'Plan for older family members';
  if (profile.sensitive) return 'Plan for sensitive family members';
  return 'Make one room easier to keep clean';
}

function familyAction(profile: Profile): Action {
  const title = familyTitle(profile);
  const sensitiveHindi = 'बच्चों, बुज़ुर्गों और संवेदनशील लोगों के लिए घर के अंदर का विकल्प तैयार रखें।';
  if (profile.children) {
    return {
      id: 'family',
      title,
      body: 'Check school or local advisories. Keep an indoor option ready for outdoor play, walks or other exertion when pollution is high.',
      reason: 'The household uses a stricter planning screen.',
      tradeoff: 'Indoor alternatives depend on access and indoor air quality. Follow school or local guidance.',
      source: 'activity',
      hindi: sensitiveHindi,
    };
  }
  if (isSensitive(profile)) {
    return {
      id: 'family',
      title,
      body: 'Check local advisories. Keep an indoor option ready for outdoor walks or heavy exertion when pollution is high.',
      reason: 'The household uses a stricter planning screen.',
      tradeoff: 'Indoor alternatives depend on indoor air quality and space. Follow local public health guidance.',
      source: 'activity',
      hindi: sensitiveHindi,
    };
  }
  const budgetTip = INDOOR[profile.budget][0];
  return {
    id: 'family',
    title,
    body: budgetTip.body,
    reason: budgetTip.reason,
    tradeoff: budgetTip.tradeoff,
    source: budgetTip.source,
    hindi: budgetTip.hindi,
  };
}

/** Builds the four daily household air-quality actions ordered by activity priority. */
export function dailyActions(env: Environment, profile: Profile, now: number): Action[] {
  const aqi = modelNow(env, now)?.aqi;
  const { usable } = findWindows(env, profile, now);
  const activity = { errands: 'errands', exercise: 'exercise', play: 'outdoor play' }[profile.activity];
  const busy = profile.work !== 'flexible';
  return [
    {
      id: 'outdoor',
      title: usable ? 'Plan a relatively cleaner window' : 'Keep flexible activity indoors if needed',
      body: usable
        ? `Consider ${activity} on ${formatDate(usable.start)}, ${formatTime(usable.start)}–${formatTime(usable.end)} IST. Recheck local conditions before leaving.`
        : `An indoor alternative or a different day is the conservative option for ${activity} when no eligible window is available.`,
      reason: usable
        ? `Two consecutive model hours pass your household and schedule filters. Peak modeled US AQI ${usable.peak}.`
        : aqi == null
          ? 'Current model data is missing or too old to use.'
          : 'Air conditions or your schedule do not support a timed outdoor suggestion.',
      tradeoff: 'The forecast represents a regional estimate. Your street may differ, and rescheduling can disrupt other plans.',
      source: 'activity',
      hindi: 'बाहर की गतिविधि से पहले स्थानीय वायु गुणवत्ता फिर जाँचें।',
    },
    {
      id: 'commute',
      title: profile.work === 'outdoor' ? 'Plan lower-exposure work breaks' : 'Adjust your travel routine',
      body: commuteGuidance(profile),
      reason: busy
        ? `Plan around ${String(profile.workStart).padStart(2, '0')}:00–${String(profile.workEnd).padStart(2, '0')}:00 IST work hours. Avoid extra outdoor exertion when pollution is high.`
        : 'A flexible schedule makes it easier to move optional travel.',
      tradeoff: 'Alternative rides and schedules can add cost or time. Choose the option you can use without extra exposure.',
      source: 'activity',
      hindi: 'प्रदूषण बढ़ने पर सड़क किनारे रुकने का समय कम रखें।',
    },
    familyAction(profile),
    ventilation(env, profile, now),
  ];
}
