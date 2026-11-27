import { useId, useState } from 'react';
import { ArrowDownUp, Clock3, Leaf } from 'lucide-react';
import { type Environment } from '../shared/model';
import { formatDate, formatTime, futureHours } from '../shared/planner';
import { calculateImpact, DEFAULT_SCENARIO, outdoorProxy, PETROL_FACTOR, scenarioBounds, scenarioSchema, travelScenarioSchema, type Scenario } from '../shared/impact';
import { CardTitle, SourceLink } from './ui';

type Field = { key: keyof Scenario; label: string };
const travelFields = [
  { key: 'currentKm', label: 'Current petrol distance (km/day)' },
  { key: 'alternativeKm', label: 'Alternative petrol distance (km/day)' },
  { key: 'days', label: 'Days per month this changes' },
  { key: 'efficiency', label: 'Petrol vehicle efficiency (km/L)' },
  { key: 'fuelPrice', label: 'Petrol price (₹/L)' },
  { key: 'alternativeCost', label: 'Extra fare or trip cost (₹/day)' },
  { key: 'households', label: 'Participating households' },
] as const satisfies readonly Field[];
const exposureFields = [
  { key: 'currentMinutes', label: 'Current outdoor minutes' },
  { key: 'alternativeMinutes', label: 'Alternative outdoor minutes' },
] as const satisfies readonly Field[];
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
  const fieldId = useId();
  const inputNumber = (key: keyof Scenario) => draft[key].trim() === '' ? undefined : Number(draft[key]);
  const travelInputs = Object.fromEntries(travelFields.map(({ key }) => [key, inputNumber(key)]));
  const scenario = travelScenarioSchema.safeParse(travelInputs).data;
  const impact = scenario ? { ...calculateImpact(scenario), households: scenario.households } : undefined;
  const currentMin = scenarioSchema.shape.currentMinutes.safeParse(inputNumber('currentMinutes')).data;
  const alternativeMin = scenarioSchema.shape.alternativeMinutes.safeParse(inputNumber('alternativeMinutes')).data;
  const minutesValid = currentMin != null && alternativeMin != null;
  const hours = futureHours(env, now, 24).filter(item => item.pm25 != null);
  const before = currentMin != null && currentHour ? outdoorProxy(env, now, Number(currentHour), currentMin) : null;
  const after = alternativeMin != null && alternativeHour ? outdoorProxy(env, now, Number(alternativeHour), alternativeMin) : null;
  const travelBars = impact ? [
    { label: 'Current', amount: impact.currentCarbon },
    { label: 'Alternative', amount: impact.alternativeCarbon },
  ] : [];
  const total = impact ? Math.max(impact.currentCarbon, impact.alternativeCarbon, 1) : 1;
  const chooseHour = (name: string, label: string, value: string, select: (value: string) => void) => <label>{label}
    <select name={name} value={hours.some(hour => String(hour.time) === value) ? value : ''} onChange={event => select(event.target.value)}>
      <option value="">Choose an hour</option>
      {hours.map(item => <option key={item.time} value={item.time}>{formatDate(item.time)} · {formatTime(item.time)} IST</option>)}
    </select></label>;
  function field({ key, label }: Field) {
    const { min, max, step } = scenarioBounds[key];
    const invalid = !scenarioSchema.shape[key].safeParse(inputNumber(key)).success;
    const id = fieldId + key;
    return <div className="scenario-field" key={key}>
      <label htmlFor={id}>{label}</label>
      <input id={id} type="number" name={key} min={min} max={max} step={step} value={draft[key]} required
        aria-invalid={invalid} aria-describedby={invalid ? id + '-error' : undefined}
        onChange={event => setDraft(previous => ({ ...previous, [key]: event.target.value }))} />
      {invalid && <p id={id + '-error'} className="field-error">
        Enter {step === 1 ? 'a whole number' : 'a number'} from {min} to {max}.
      </p>}
    </div>;
  }
  return <div className="section-stack">
    <div className="section-grid equal">
      <section className="card">
        <CardTitle icon={<ArrowDownUp size={20}/>} title="Petrol travel comparison" sub="Editable illustrative inputs" />
        <div className="segmented scenario-buttons">
          <button onClick={() => setDraft(toDraft(DEFAULT_SCENARIO))}>Combine errands</button>
          <button onClick={() => setDraft(toDraft({ ...DEFAULT_SCENARIO, alternativeKm: 0, days: 4 }))}>Avoid a trip</button>
          <button onClick={() => setDraft(toDraft({ ...DEFAULT_SCENARIO, alternativeKm: 3, alternativeCost: 50 }))}>Try transit</button>
        </div>
        <div className="form-grid">{travelFields.map(field)}</div>
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
          <div className="compare-bars" role="group" aria-label="Current and alternative petrol tailpipe CO₂">
            {travelBars.map(({ label, amount }) =>
              <div key={label}><span>{label}</span><div className="compare-track" aria-hidden="true"><span style={{width: 100 * amount / total + '%'}}/></div><strong>{fmt.format(amount)} kg</strong></div>
            )}
          </div>
          <div className="feature-box"><strong>{fmt.format(Math.abs(impact.community))} kg {impact.community >= 0 ? 'of tailpipe CO₂ avoided' : 'of additional tailpipe CO₂'}</strong>
            <p>If {fmt.format(impact.households)} households made the same petrol change for one month. This is an illustrative projection.</p></div>
        </> : <div className="empty">Results appear after the inputs are valid.</div>}
        <details className="details mt-4"><summary>Formulas and assumptions</summary>
          <p>Litres = distance × days ÷ km per litre. Tailpipe CO₂ = litres × {PETROL_FACTOR} kg CO₂/L (UK petrol proxy). Savings = fuel saved × petrol price − extra daily fare × days. Community impact = per-household change × participating households.</p>
          <p>The scenario excludes transit emissions, fuel production, non-CO₂ gases and vehicle costs. The factor may differ for Indian fuel blends.</p><SourceLink id="fuel" />
        </details>
      </section>
    </div>
    <section className="card">
      <CardTitle icon={<Clock3 size={20}/>} title="Outdoor PM2.5 comparison" sub="Time outdoors × forecast concentration" />
      <div className="form-grid four">{chooseHour('current-hour', 'Current forecast hour', currentHour, setCurrentHour)}{chooseHour('alternative-hour', 'Alternative forecast hour', alternativeHour, setAlternativeHour)}{exposureFields.map(field)}</div>
      {!minutesValid && <p className="notice" role="status">Enter whole outdoor minutes between 0 and 60.</p>}
      <div className="impact-grid proxy-results">
        <Metric label="Current outdoor proxy" value={before == null ? '—' : fmt.format(before) + ' µg·h/m³'}/>
        <Metric label="Alternative outdoor proxy" value={after == null ? '—' : fmt.format(after) + ' µg·h/m³'}/>
        {before != null && after != null && <Metric label={before >= after ? 'Lower outdoor proxy' : 'Higher outdoor proxy'} value={fmt.format(Math.abs(before - after)) + ' µg·h/m³'}/>}
      </div>
      <p className="muted text-sm">Choose two fresh forecast hours. The estimate assumes a constant concentration for each selected hour and stops at 60 minutes. Route conditions, exertion, indoor air and inhaled dose can differ. Follow your planner and local guidance when deciding whether to go out.</p>
    </section>
  </div>;
}
