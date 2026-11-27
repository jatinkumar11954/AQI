import { type Environment, type Profile, type SourceId } from './model.js';
import { dailyActions, INDOOR, modelNow, risk, SUSTAINABLE, ventilation } from './planner.js';

export const TOPICS = ['outdoors', 'commute', 'ventilation', 'cooking', 'filtration', 'family', 'impact', 'sources', 'unsupported'] as const;
export type Topic = typeof TOPICS[number];
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

export function composeAnswer(topic: Topic, profile: Profile, env: Environment, now: number, language: 'en' | 'hi') {
  const actions = dailyActions(env, profile, now);
  const aqi = modelNow(env, now)?.aqi;
  const links: SourceId[] = [];
  const context = aqi == null ? 'Current model AQI is unavailable for this answer.' :
    `Current modeled US AQI ${aqi} · ${risk(aqi).label}. Check CPCB for local official guidance.`;
  const byTopic = {
    outdoors: actions[0], commute: actions[1], family: actions[2],
    ventilation: ventilation(env, profile, now), cooking: INDOOR.zero[1],
    filtration: INDOOR[profile.budget][0], impact: SUSTAINABLE[0],
  };
  if (topic === 'sources') {
    const prefix = language === 'hi' ? 'यहाँ मॉडल (US AQI) और स्टेशन के आँकड़े (OpenAQ और CPCB) अलग-अलग दिखाए गए हैं। ' : '';
    return { text: prefix + 'The forecast uses the Open-Meteo CAMS US AQI. The station panel shows either OpenAQ particulate measurements or India-scale sub-indices relayed from CPCB station data. The CPCB portal reports the official India National AQI.', context, sources: ['model', 'relay', 'openaq', 'cpcb'] as SourceId[] };
  }
  if (topic === 'unsupported') {
    return { text: language === 'hi'
      ? 'मैं बाहर की गतिविधि, सफ़र, खिड़की, खाना पकाने या फ़िल्टर के बारे में मदद कर सकता हूँ।'
      : 'I can answer questions about outdoor timing, commuting, ventilation, cooking, filtration, household precautions or the petrol impact calculator.', context, sources: links };
  }
  const action = byTopic[topic];
  links.push(action.source);
  const hindi = language === 'hi' && action.hindi ? action.hindi + ' ' : '';
  return { text: hindi + action.body + ' ' + action.reason, context, sources: links };
}
