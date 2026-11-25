import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowDownUp, ArrowRight, CalendarDays, Check, CircleHelp, Clock3, House, Leaf, Send, ShieldCheck, Sparkles, UsersRound, Wallet, Wind } from 'lucide-react';
import { PROFILES, SOURCES, type City, type Environment, type Profile } from '../shared/model';
import { dailyActions, formatDate, formatTime, futureHours, INDOOR, SUSTAINABLE, ventilation, type Action } from '../shared/planner';
import { calculateImpact, DEFAULT_SCENARIO, outdoorProxy, PETROL_FACTOR, scenarioSchema, type Scenario } from '../shared/impact';
import { type Answer } from '../shared/assistant';
import { askSaansAI } from './data';
import { CleanerWindow } from './overview';
import { CardTitle, SourceLink, useStored } from './ui';

type Shared = { env: Environment; now: number; profile: Profile; hindi: boolean };
const budgetNames = { zero: 'Zero cost', low: 'Low budget', premium: 'Premium' };
const selectOptions = {
  work: [['office', 'On-site / office'], ['outdoor', 'Outdoor work'], ['remote', 'Work from home'], ['flexible', 'Flexible / no fixed hours']],
  commute: [['car', 'Petrol car / cab'], ['two-wheeler', 'Two-wheeler'], ['transit', 'Metro / bus'], ['walk', 'Walk / cycle'], ['none', 'No regular commute']],
  activity: [['errands', 'Errands'], ['exercise', 'Exercise / walk'], ['play', 'Outdoor play']],
  budget: Object.entries(budgetNames),
} as const;

function ActionText({ action, hindi }: { action: Action; hindi: boolean }) {
  return <><h3>{action.title}</h3><p>{action.body}</p>
    {hindi && action.hindi && <p lang="hi" className="hindi-tip">{action.hindi}</p>}
    <details className="details"><summary>Why this helps</summary><p>{action.reason}</p><SourceLink id={action.source}/></details></>;
}

export function Planner({ env, now, profile, hindi, city, setProfile, chooseCity, dayKey, loading }:
  Shared & { city: City; setProfile: (profile: Profile) => void; chooseCity: (city: City) => void; dayKey: string; loading: boolean }) {
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile({ ...profile, [key]: value });
  const [checked, setChecked] = useStored('saans:checklist', { key: '', ids: [] as string[] });
  const key = dayKey + ':' + city.lat + ',' + city.lon;
  const active = checked.key === key && Array.isArray(checked.ids) ? checked.ids : [];
  const actions = dailyActions(env, profile, now);
  const done = actions.filter(item => active.includes(item.id)).length;
  const title = {
    work: 'Work setting', commute: 'Usual commute', activity: 'Flexible activity', budget: 'Household budget',
  };
  return <div className="section-stack">
    <section className="card sample-card">
      <CardTitle icon={<UsersRound size={20}/>} title="Try a sample household" sub="Sample settings with live data for the selected city" />
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
            return <label key={key}><input type="checkbox" checked={profile[field]} onChange={event => set(field, event.target.checked)}/>{label}</label>;
          })}
        </fieldset>
        <div className="form-grid">
          {(Object.keys(title) as (keyof typeof title)[]).map(field => <label key={field}>{title[field]}
            <select value={profile[field]} onChange={event => set(field, event.target.value as Profile[typeof field])}>
              {selectOptions[field].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>)}
          {(['workStart', 'workEnd'] as const).map(field => <label key={field}>{field === 'workStart' ? 'Work starts (IST)' : 'Work ends (IST)'}
            <select value={profile[field]} onChange={event => set(field, Number(event.target.value))}>
              {Array.from({ length: 24 }, (_, n) => <option key={n} value={n}>{String(n).padStart(2, '0')}:00</option>)}
            </select></label>)}
        </div>
        <p className="muted text-sm mt-4">Choose the same start and end hour when your work has no fixed block. Overnight shifts are supported.</p>
      </section>
      <CleanerWindow env={env} now={now} profile={profile} loading={loading}/>
    </div>
    <section className="card">
      <CardTitle icon={<ShieldCheck size={20}/>} title="Daily household checklist" sub={city.name + ' · ' + formatDate(now) + ' · ' + done + ' of ' + actions.length + ' complete'} />
      <div className="action-list">{actions.map(action => <article key={action.id}>
        <label className="check-action"><input type="checkbox" checked={active.includes(action.id)} aria-label={action.title + ' completed'}
          onChange={event => setChecked({ key, ids: event.target.checked ? [...new Set([...active, action.id])] : active.filter(id => id !== action.id) })}/><Check size={15}/></label>
        <div><ActionText action={action} hindi={hindi}/></div>
      </article>)}</div>
    </section>
  </div>;
}

export function Indoor({ env, now, profile, hindi, setProfile }: Shared & { setProfile: (profile: Profile) => void }) {
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

const fields: { key: keyof Scenario; label: string; min: number; max: number; step: number }[] = [
  { key: 'currentKm', label: 'Current petrol distance (km/day)', min: 0, max: 500, step: .1 },
  { key: 'alternativeKm', label: 'Alternative petrol distance (km/day)', min: 0, max: 500, step: .1 },
  { key: 'days', label: 'Days per month this changes', min: 1, max: 31, step: 1 },
  { key: 'efficiency', label: 'Petrol vehicle efficiency (km/L)', min: 3, max: 100, step: .1 },
  { key: 'fuelPrice', label: 'Petrol price (₹/L)', min: 0, max: 300, step: .1 },
  { key: 'alternativeCost', label: 'Extra fare or trip cost (₹/day)', min: 0, max: 5000, step: .1 },
  { key: 'households', label: 'Participating households', min: 1, max: 10000, step: 1 },
  { key: 'currentMinutes', label: 'Current outdoor minutes', min: 0, max: 60, step: 1 },
  { key: 'alternativeMinutes', label: 'Alternative outdoor minutes', min: 0, max: 60, step: 1 },
];
const fmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });
type Draft = Record<keyof Scenario, string>;
const toDraft = (scenario: Scenario) => Object.fromEntries(Object.entries(scenario).map(([key, val]) => [key, String(val)])) as Draft;
function Metric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return <div className="impact-metric"><span>{label}</span><strong>{value}</strong>{detail && <small>{detail}</small>}</div>;
}

export function Improvement({ env, now }: { env: Environment; now: number }) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(DEFAULT_SCENARIO));
  const [currentHour, setCurrentHour] = useState('');
  const [alternativeHour, setAlternativeHour] = useState('');
  const result = scenarioSchema.safeParse(Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim() ? Number(value) : undefined])));
  const scenario = result.data;
  const impact = scenario ? calculateImpact(scenario) : null;
  const hours = futureHours(env, now, 24).filter(item => item.pm25 != null);
  const before = scenario && currentHour ? outdoorProxy(env, now, Number(currentHour), scenario.currentMinutes) : null;
  const after = scenario && alternativeHour ? outdoorProxy(env, now, Number(alternativeHour), scenario.alternativeMinutes) : null;
  const total = impact ? Math.max(impact.currentCarbon, impact.alternativeCarbon, 1) : 1;
  const chooseHour = (label: string, value: string, select: (value: string) => void) => <label>{label}
    <select value={hours.some(hour => String(hour.time) === value) ? value : ''} onChange={event => select(event.target.value)}>
      <option value="">Choose an hour</option>
      {hours.map(item => <option key={item.time} value={item.time}>{formatDate(item.time)} · {formatTime(item.time)} IST</option>)}
    </select></label>;
  const field = (item: typeof fields[number]) => <label key={item.key}>{item.label}
    <input type="number" min={item.min} max={item.max} step={item.step} value={draft[item.key]} required
      aria-invalid={draft[item.key] === '' || Number(draft[item.key]) < item.min || Number(draft[item.key]) > item.max || (item.step === 1 && !Number.isInteger(Number(draft[item.key])))}
      onChange={event => setDraft(previous => ({ ...previous, [item.key]: event.target.value }))}/>
  </label>;
  return <div className="section-stack">
    <div className="section-grid equal">
      <section className="card">
        <CardTitle icon={<ArrowDownUp size={20}/>} title="Petrol travel comparison" sub="Editable illustrative inputs" />
        <div className="segmented scenario-buttons">
          <button onClick={() => setDraft(toDraft(DEFAULT_SCENARIO))}>Combine errands</button>
          <button onClick={() => setDraft(toDraft({ ...DEFAULT_SCENARIO, alternativeKm: 0, days: 4 }))}>Avoid a trip</button>
          <button onClick={() => setDraft(toDraft({ ...DEFAULT_SCENARIO, alternativeKm: 3, alternativeCost: 50 }))}>Try transit</button>
        </div>
        <div className="form-grid">{fields.slice(0, 7).map(field)}</div>
        <p className="muted text-sm mt-4">Enter your actual petrol distance and extra fares. Compare net pollution qualitatively when switching modes.</p>
        {!impact && <p className="notice" role="status">Complete each input within its allowed range to show an estimate.</p>}
      </section>
      <section className="card">
        <CardTitle icon={<Leaf size={20}/>} title="Estimated monthly impact" sub="Petrol combustion and travel spending" />
        {impact ? <>
          <div className="impact-grid">
            <Metric label={impact.carbon >= 0 ? 'Tailpipe CO₂ avoided' : 'Extra tailpipe CO₂'} value={fmt.format(Math.abs(impact.carbon)) + ' kg'} detail="Petrol component only" />
            <Metric label={impact.savings >= 0 ? 'Fuel & fare savings' : 'Extra fuel & fare cost'} value={'₹' + fmt.format(Math.abs(impact.savings))} detail={fmt.format(Math.abs(impact.litres)) + ' L ' + (impact.litres >= 0 ? 'less petrol' : 'more petrol')} />
          </div>
          <div className="compare-bars" aria-label="Current and alternative petrol tails">
            {[['Current', impact.currentCarbon], ['Alternative', impact.alternativeCarbon]].map(([label, amount]) =>
              <div key={label}><span>{label}</span><div className="compare-track" aria-hidden="true"><span style={{width: 100 * Number(amount) / total + '%'}}/></div><strong>{fmt.format(Number(amount))} kg</strong></div>
            )}
          </div>
          <div className="feature-box"><strong>{fmt.format(Math.abs(impact.community))} kg {impact.community >= 0 ? 'of tailpipe CO₂ avoided' : 'of additional tailpipe CO₂'}</strong>
            <p>If {fmt.format(scenario!.households)} households made the same petrol change for one month. This is an illustrative projection.</p></div>
        </> : <div className="empty">Results appear after the inputs are valid.</div>}
        <details className="details mt-4"><summary>Formulas and assumptions</summary>
          <p>Litres = distance × days ÷ km per litre. Tailpipe CO₂ = litres × {PETROL_FACTOR} kg CO₂/L (UK petrol proxy). Savings = fuel saved × petrol price − extra daily fare × days. Community impact = per-household change × participating households.</p>
          <p>The scenario excludes transit emissions, fuel production, non-CO₂ gases and vehicle costs. The factor may differ for Indian fuel blends.</p><SourceLink id="fuel" />
        </details>
      </section>
    </div>
    <section className="card">
      <CardTitle icon={<Clock3 size={20}/>} title="Outdoor PM2.5 comparison" sub="Time outdoors × forecast concentration" />
      <div className="form-grid four">{chooseHour('Current forecast hour', currentHour, setCurrentHour)}{chooseHour('Alternative forecast hour', alternativeHour, setAlternativeHour)}{fields.slice(7).map(field)}</div>
      <div className="impact-grid proxy-results">
        <Metric label="Current outdoor proxy" value={before == null ? '—' : fmt.format(before) + ' µg·h/m³'}/>
        <Metric label="Alternative outdoor proxy" value={after == null ? '—' : fmt.format(after) + ' µg·h/m³'}/>
        {before != null && after != null && <Metric label={before >= after ? 'Lower outdoor proxy' : 'Higher outdoor proxy'} value={fmt.format(Math.abs(before - after)) + ' µg·h/m³'}/>}
      </div>
      <p className="muted text-sm">Choose two fresh forecast hours. The estimate assumes a constant concentration for each selected hour and stops at 60 minutes. Route conditions, exertion, indoor air and inhaled dose can differ. Follow your planner and local guidance when deciding whether to go out.</p>
    </section>
  </div>;
}

const prompts = ['Should I open the windows?', 'How should I adjust my commute?', 'Can the children play outside?', 'What can I do about cooking smoke?'];
const labels = { unconfigured: 'Gemini is unconfigured · Rules answer', quota: 'Gemini quota reached · Rules answer', unavailable: 'Gemini unavailable · Rules answer' };

export function Assistant({ city, profile, hindi, env }: { city: City; profile: Profile; hindi: boolean; env: Environment }) {
  const [question, setQuestion] = useState('');
  const [entries, setEntries] = useState<{ question: string; answer: Answer }[]>([]);
  const [pending, setPending] = useState('');
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const fieldId = useId();
  useEffect(() => () => request.current?.abort(), []);

  async function ask(text: string) {
    const value = text.trim();
    if (pending || value.length < 2 || value.length > 350) return;
    const controller = new AbortController();
    request.current = controller;
    setError(''); setQuestion(''); setPending(value);
    const timeout = AbortSignal.timeout(14_000);
    try {
      const answer = await askSaansAI(value, city, profile, hindi ? 'hi' : 'en', env, AbortSignal.any([controller.signal, timeout]));
      if (!controller.signal.aborted) setEntries(previous => [...previous.slice(-7), { question: value, answer }]);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setQuestion(value);
        setError(timeout.aborted ? 'The question timed out. Try again.' : (cause instanceof Error ? cause.message : 'The assistant is unavailable.'));
      }
    } finally {
      if (!controller.signal.aborted) setPending('');
    }
  }
  function submit(event: FormEvent) { event.preventDefault(); void ask(question); }

  return <div className="section-grid">
    <section className="card assistant-card">
      <CardTitle icon={<Sparkles size={20}/>} title="Your air assistant" sub={city.name + ' · Household settings applied'} />
      <div className="prompt-grid">{prompts.map(prompt => <button className="button" key={prompt} disabled={Boolean(pending)} onClick={() => void ask(prompt)}>{prompt}</button>)}</div>
      <div className="conversation" role="log" aria-label="Assistant responses">
        {entries.map(({ question: text, answer }, index) => <article key={index + text}>
          <div className="question-bubble">{text}</div>
          <div className="answer-bubble"><span className="eyebrow">{answer.mode === 'gemini' ? 'GEMINI · SOURCE-GROUNDED' : answer.status ? labels[answer.status] : 'Rules answer'}</span>
            <p>{answer.text}</p><p className="muted">{answer.context}</p>
            <div className="answer-sources">{answer.sources.map(id => <SourceLink key={id} id={id}/>)}</div></div>
        </article>)}
        {pending && <p className="empty" role="status">Checking your context…</p>}
      </div>
      {error && <p className="notice" role="alert">{error}</p>}
      <form className="assistant-form" onSubmit={submit}>
        <label htmlFor={fieldId}>Your question</label>
        <div className="search"><input id={fieldId} value={question} onChange={event => setQuestion(event.target.value)} maxLength={350} placeholder="Ask about your local air…" required minLength={2}/>
          <button className="button primary" disabled={Boolean(pending) || question.trim().length < 2}><Send size={17}/> Send</button></div>
      </form>
    </section>
    <section className="card">
      <CardTitle icon={<CircleHelp size={20}/>} title="How answers are grounded"/>
      <div className="guidance"><Signal icon={<CalendarDays size={18}/>}>Plans use your selected city, the current model and household settings.</Signal>
        <Signal icon={<ShieldCheck size={18}/>}>Gemini identifies the question topic. Reviewed guidance, source links and calculations come from SaansAI.</Signal>
        <Signal icon={<House size={18}/>}>Questions and household settings can be sent to Gemini. Keep names, addresses and medical information out of the question.</Signal></div>
      <SourceLink id="activity" short={SOURCES.activity.title} />
    </section>
  </div>;
}

function Signal({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div><span className="icon-tile">{icon}</span><p>{children}</p></div>;
}
