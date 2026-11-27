import { type Environment, type Profile } from '../shared/model';
import { type Action } from '../shared/planner';
import { SourceLink } from './ui';

export type GuidanceContext = { env: Environment; now: number; profile: Profile; hindi: boolean };
export const budgetNames = { zero: 'Zero cost', low: 'Low budget', premium: 'Premium' };

export function ActionText({ action, hindi }: { action: Action; hindi: boolean }) {
  return <><h3>{action.title}</h3><p>{action.body}</p>
    {hindi && action.hindi && <p lang="hi" className="hindi-tip">{action.hindi}</p>}
    <details className="details"><summary>Why this helps and what to consider</summary><p>{action.reason}</p><p>{action.tradeoff}</p><SourceLink id={action.source}/></details></>;
}
