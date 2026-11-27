import { useState } from 'react';
import { ArrowRight, Leaf, Wallet, Wind } from 'lucide-react';
import { type Profile } from '../shared/model';
import { INDOOR, SUSTAINABLE, ventilation } from '../shared/planner';
import { ActionText, budgetNames, type GuidanceContext } from './action-text';
import { CardTitle } from './ui';

export function Indoor({ env, now, profile, hindi, setProfile }: GuidanceContext & { setProfile: (profile: Profile) => void }) {
  const [tier, setTier] = useState(profile.budget);
  const action = ventilation(env, profile, now);
  return <div className="section-stack">
    <div className="section-grid">
      <section className="card">
        <CardTitle icon={<Wind size={20}/>} title="Ventilation guidance" sub="Outdoor conditions and household settings" />
        <div className="feature-box"><ActionText action={action} hindi={hindi}/></div>
      </section>
      <section className="card">
        <CardTitle icon={<Wallet size={20}/>} title="Indoor action by budget" sub="Start with the sources you can control" />
        <div className="segmented budget-tabs">{(Object.keys(budgetNames) as Profile['budget'][]).map(value => <button key={value} aria-pressed={tier === value} onClick={() => setTier(value)}>{budgetNames[value]}</button>)}</div>
        <div className="action-list">{INDOOR[tier].map(item => <article key={item.id}><div><ActionText action={item} hindi={hindi}/></div></article>)}</div>
        {tier !== profile.budget && <button className="button" onClick={() => setProfile({ ...profile, budget: tier })}>Use this budget in my plan</button>}
      </section>
    </div>
    <section className="card">
      <CardTitle icon={<Leaf size={20}/>} title="Low-emission routines" sub="Changes you can make at home or with neighbours" />
      <div className="routine-grid">{SUSTAINABLE.map(item => <article className="feature-box" key={item.id}><ActionText action={item} hindi={hindi}/></article>)}</div>
      <a className="text-link mt-4" href="#impact">Compare travel alternatives <ArrowRight size={16}/></a>
    </section>
  </div>;
}
