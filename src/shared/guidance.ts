import type { Environment, Profile } from './model.js';
import { commuteAction, isSensitive, outdoorAction, ventilation, type Action } from './planner.js';

export const COOKING_ACTION: Action = {
  id: 'cooking',
  title: 'Use kitchen exhaust while cooking',
  body: 'Use an outside-vented hood or kitchen exhaust if available. Use back burners when the hood covers them better, and avoid charring food.',
  reason: 'Cooking produces particles even in a home without tobacco smoke.',
  tradeoff: 'An exhaust fan only helps if it vents outdoors. Follow appliance safety instructions.',
  source: 'cooking',
  hindi: 'खाना बनाते समय बाहर की ओर जाने वाला एग्ज़ॉस्ट चलाएँ।',
};

export const INDOOR: Record<Profile['budget'], readonly [Action, ...Action[]]> = {
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
    COOKING_ACTION,
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

export const COMBINE_TRIPS_ACTION: Action = {
  id: 'combine',
  title: 'Combine petrol trips',
  body: 'Group errands or use a nearby pickup point where practical. Skip a trip outright when remote work or a shared pickup is already available.',
  reason: 'Fewer petrol kilometres generally mean less fuel burned. Use the simulator to compare your own routine.',
  tradeoff: 'Combining stops can take longer. Compare the actual distance and avoid extra roadside waiting during high pollution.',
  source: 'fuel',
  hindi: 'कई छोटे चक्करों के बजाय काम एक साथ निपटाकर पेट्रोल सफ़र कम करें।',
};

export const SUSTAINABLE: Action[] = [
  COMBINE_TRIPS_ACTION,
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

export function budgetAction(budget: Profile['budget']): Action {
  return INDOOR[budget][0];
}

function familyTitle(profile: Profile): string {
  if (profile.children && profile.seniors) return 'Plan for children and older adults';
  if (profile.children) return 'Plan for school and play';
  if (profile.seniors) return 'Plan for older family members';
  if (profile.sensitive) return 'Plan for sensitive family members';
  return 'Make one room easier to keep clean';
}

export function familyAction(profile: Profile): Action {
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
  const budgetTip = budgetAction(profile.budget);
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

/** Builds the daily checklist in display order. */
export function dailyActions(env: Environment, profile: Profile, now: number): Action[] {
  return [outdoorAction(env, profile, now), commuteAction(profile), familyAction(profile), ventilation(env, profile, now)];
}
