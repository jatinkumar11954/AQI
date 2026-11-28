import { COMBINE_TRIPS_ACTION, COOKING_ACTION, budgetAction, familyAction } from './guidance.js';
import type { Answer, Environment, Profile, SourceId } from './model.js';
import {
  commuteAction,
  modelNow,
  outdoorAction,
  risk,
  ventilation,
  type Action,
} from './planner.js';

export const TOPICS = ['outdoors', 'commute', 'ventilation', 'cooking', 'filtration', 'family', 'impact', 'sources', 'unsupported'] as const;
export type Topic = typeof TOPICS[number];
const OVERVIEW_SOURCES: SourceId[] = ['model', 'relay', 'openaq', 'cpcb'];

/** Classifies a free-text user question into a supported assistant topic. */
export function inferTopic(question: string): Topic {
  const rules: [Topic, RegExp][] = [
    ['ventilation', /ventilat|windows?|air out|खिड़की/i],
    ['cooking', /cook|kitchen|incense|fry|खाना|धुआँ/i],
    ['filtration', /hepa|filter|purif|budget|फ़िल्टर|बजट/i],
    ['commute', /commut|metro|bus|bike|ride|work|सफ़र|मेट्रो/i],
    ['family', /child|kid|school|senior|elder|family|बच्च|बुज़ुर्ग/i],
    ['outdoors', /play|walk|run|exercis|outdoor|outside|errand|बाहर|टहल/i],
    ['impact', /impact|petrol|emission|saving|carbon|बचत/i],
    ['sources', /aqi|data|measur|source|standard|स्टेशन|आँकड़े|माप/i],
  ];
  return rules.find(([, expression]) => expression.test(question))?.[0] ?? 'unsupported';
}

function topicAction(
  topic: Exclude<Topic, 'sources' | 'unsupported'>,
  profile: Profile,
  env: Environment,
  now: number,
): Action {
  switch (topic) {
    case 'outdoors': return outdoorAction(env, profile, now);
    case 'commute': return commuteAction(profile);
    case 'family': return familyAction(profile);
    case 'ventilation': return ventilation(env, profile, now);
    case 'cooking': return COOKING_ACTION;
    case 'filtration': return budgetAction(profile.budget);
    case 'impact': return COMBINE_TRIPS_ACTION;
  }
}

/** Builds a deterministic, rule-based grounded response for the selected topic and profile. */
export function composeAnswer(topic: Topic, profile: Profile, env: Environment, now: number, language: 'en' | 'hi'): Pick<Answer, 'text' | 'context' | 'sources'> {
  const aqi = modelNow(env, now)?.aqi;
  const context = aqi == null
    ? 'Current model AQI is unavailable for this answer.'
    : `Current modeled US AQI ${aqi} · ${risk(aqi).label}. Check CPCB for local official guidance.`;
  if (topic === 'sources') {
    const prefix = language === 'hi'
      ? 'यहाँ मॉडल (US AQI) और स्टेशन के आँकड़े (OpenAQ और CPCB) अलग-अलग दिखाए गए हैं। '
      : '';
    return {
      text: prefix + 'The forecast uses the Open-Meteo CAMS US AQI. The station panel shows either OpenAQ particulate measurements or India-scale sub-indices relayed from CPCB station data. The CPCB portal reports the official India National AQI.',
      context,
      sources: [...OVERVIEW_SOURCES],
    };
  }
  if (topic === 'unsupported') {
    return {
      text: language === 'hi'
        ? 'मैं बाहर की गतिविधि, सफ़र, खिड़की, खाना पकाने या फ़िल्टर के बारे में मदद कर सकता हूँ।'
        : 'I can answer questions about outdoor timing, commuting, ventilation, cooking, filtration, household precautions or the petrol impact calculator.',
      context,
      sources: [],
    };
  }
  const action = topicAction(topic, profile, env, now);
  const hindi = language === 'hi' && action.hindi ? action.hindi + ' ' : '';
  return { text: hindi + action.body + ' ' + action.reason, context, sources: [action.source] };
}
