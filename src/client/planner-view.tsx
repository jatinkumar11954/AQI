import { CalendarDays, Check, ShieldCheck, UsersRound } from 'lucide-react';
import { z } from 'zod';
import { PROFILES, type City, type Profile } from '../shared/model';
import { dailyActions, formatDate } from '../shared/planner';
import { ActionText, budgetNames, type GuidanceContext } from './action-text';
import { CleanerWindow } from './overview';
import { CardTitle } from './ui';
import { useStored } from './use-stored';

const selectOptions = {
  work: [['office', 'On-site / office'], ['outdoor', 'Outdoor work'], ['remote', 'Work from home'], ['flexible', 'Flexible / no fixed hours']],
  commute: [['car', 'Petrol car / cab'], ['two-wheeler', 'Two-wheeler'], ['transit', 'Metro / bus'], ['walk', 'Walk / cycle'], ['none', 'No regular commute']],
  activity: [['errands', 'Errands'], ['exercise', 'Exercise / walk'], ['play', 'Outdoor play']],
  budget: Object.entries(budgetNames),
} as const;
const checklistSchema = z.object({ key: z.string(), ids: z.array(z.string()) });

export function Planner({ env, now, profile, hindi, city, setProfile, chooseCity, dayKey, loading }:
  GuidanceContext & { city: City; setProfile: (profile: Profile) => void; chooseCity: (city: City) => void; dayKey: string; loading: boolean }) {
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile({ ...profile, [key]: value });
  const [checked, setChecked] = useStored('saans:checklist', { key: '', ids: [] }, checklistSchema);
  const key = dayKey + ':' + city.lat + ',' + city.lon;
  const active = checked.key === key ? checked.ids : [];
  const actions = dailyActions(env, profile, now);
  const done = actions.filter(item => active.includes(item.id)).length;
  const title = {
    work: 'Work setting', commute: 'Usual commute', activity: 'Flexible activity', budget: 'Household budget',
  };
  return <div className="section-stack">
    <section className="card sample-card">
      <CardTitle icon={<UsersRound size={20}/>} title="Try a sample household" sub="Loads sample settings and switches to that city" />
      <div className="sample-grid">{PROFILES.map(sample => <button className="place" key={sample.name} onClick={() => { setProfile(sample.profile); chooseCity(sample.city); }}
        aria-pressed={city.name === sample.city.name && JSON.stringify(profile) === JSON.stringify(sample.profile)}>
        <strong>{sample.name}</strong><span>{sample.description}</span>
      </button>)}</div>
    </section>
    <div className="section-grid">
      <section className="card">
        <CardTitle icon={<CalendarDays size={20}/>} title="Household settings" sub="Saved on this device" />
        <fieldset className="check-fields"><legend>Who should the plan consider?</legend>
          {[['children', 'Children'], ['seniors', 'Older adults'], ['sensitive', 'Sensitive to air pollution']].map(([key, label]) => {
            const field = key as 'children' | 'seniors' | 'sensitive';
            return <label key={key}><input type="checkbox" name={field} checked={profile[field]} onChange={event => set(field, event.target.checked)}/>{label}</label>;
          })}
        </fieldset>
        <div className="form-grid">
          {(Object.keys(title) as (keyof typeof title)[]).map(field => <label key={field}>{title[field]}
            <select name={field} value={profile[field]} onChange={event => set(field, event.target.value as Profile[typeof field])}>
              {selectOptions[field].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>)}
          {(['workStart', 'workEnd'] as const).map(field => <label key={field}>{field === 'workStart' ? 'Work starts (IST)' : 'Work ends (IST)'}
            <select name={field} value={profile[field]} onChange={event => set(field, Number(event.target.value))}>
              {Array.from({ length: 24 }, (_, n) => <option key={n} value={n}>{String(n).padStart(2, '0')}:00</option>)}
            </select></label>)}
        </div>
        <p className="muted text-sm mt-4">Choose the same start and end hour when your work has no fixed block. Overnight shifts are supported.</p>
      </section>
      <CleanerWindow env={env} now={now} profile={profile} loading={loading} showLink={false}/>
    </div>
    <section className="card">
      <CardTitle icon={<ShieldCheck size={20}/>} title="Daily household checklist" sub={city.name + ' · ' + formatDate(now)} />
      <p className="checklist-progress" role="status">{done} of {actions.length} complete</p>
      <div className="action-list">{actions.map(action => <article key={action.id}>
        <label className="check-action"><input type="checkbox" name={'check-' + action.id} checked={active.includes(action.id)} aria-label={action.title + ' completed'}
          onChange={event => setChecked({ key, ids: event.target.checked ? [...new Set([...active, action.id])] : active.filter(id => id !== action.id) })}/><Check size={15} aria-hidden="true"/></label>
        <div><ActionText action={action} hindi={hindi}/></div>
      </article>)}</div>
    </section>
  </div>;
}
