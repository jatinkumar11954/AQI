import { CalendarDays, Check, ShieldCheck, UsersRound } from 'lucide-react';
import { z } from 'zod';
import { PROFILES, sameProfile, type City, type Profile } from '../shared/model';
import { dailyActions, formatDate } from '../shared/planner';
import { ActionText, BUDGET_TIERS, budgetNames, type GuidanceContext } from './action-text';
import { CleanerWindow } from './overview';
import { CardTitle } from './ui';
import { useStored } from './use-stored';

type SelectKey = 'work' | 'commute' | 'activity' | 'budget';

const selectOptions: { [K in SelectKey]: readonly (readonly [Profile[K], string])[] } = {
  work: [
    ['office', 'On-site / office'],
    ['outdoor', 'Outdoor work'],
    ['remote', 'Work from home'],
    ['flexible', 'Flexible / no fixed hours'],
  ],
  commute: [
    ['car', 'Petrol car / cab'],
    ['two-wheeler', 'Two-wheeler'],
    ['transit', 'Metro / bus'],
    ['walk', 'Walk / cycle'],
    ['none', 'No regular commute'],
  ],
  activity: [
    ['errands', 'Errands'],
    ['exercise', 'Exercise / walk'],
    ['play', 'Outdoor play'],
  ],
  budget: BUDGET_TIERS.map(tier => [tier, budgetNames[tier]]),
};

const checkboxFields = [
  { field: 'children', label: 'Children' },
  { field: 'seniors', label: 'Older adults' },
  { field: 'sensitive', label: 'Sensitive to air pollution' },
] as const;

const shiftFields = [
  { field: 'workStart', label: 'Work starts (IST)' },
  { field: 'workEnd', label: 'Work ends (IST)' },
] as const;

const WORK_HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const checklistSchema = z.object({ key: z.string(), ids: z.array(z.string()) });

/** Lets users configure household profile constraints and track daily protective actions. */
export function Planner({
  env,
  now,
  profile,
  hindi,
  city,
  setProfile,
  chooseCity,
  dayKey,
  loading,
}: GuidanceContext & {
  city: City;
  setProfile: (profile: Profile) => void;
  chooseCity: (city: City) => void;
  dayKey: string;
  loading: boolean;
}) {
  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setProfile({ ...profile, [key]: value });
  const [checked, setChecked] = useStored('saans:checklist', { key: '', ids: [] }, checklistSchema);
  const key = `${dayKey}:${city.lat},${city.lon}`;
  const active = checked.key === key ? checked.ids : [];
  const actions = dailyActions(env, profile, now);
  const done = actions.filter(item => active.includes(item.id)).length;

  function renderSelect<K extends SelectKey>(field: K, label: string) {
    const options = selectOptions[field];
    return (
      <label key={field}>
        {label}
        <select
          name={field}
          value={profile[field]}
          onChange={event => {
            const match = options.find(([optionValue]) => optionValue === event.target.value);
            if (match) set(field, match[0]);
          }}
        >
          {options.map(([optionValue, optionLabel]) => (
            <option key={optionValue} value={optionValue}>
              {optionLabel}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <div className="section-stack">
      <section className="card sample-card">
        <CardTitle
          icon={<UsersRound size={20} />}
          title="Try a sample household"
          sub="Loads sample settings and switches to that city"
        />
        <div className="sample-grid">
          {PROFILES.map(sample => (
            <button
              className="place"
              key={sample.name}
              onClick={() => {
                setProfile(sample.profile);
                chooseCity(sample.city);
              }}
              aria-pressed={city.name === sample.city.name && sameProfile(profile, sample.profile)}
            >
              <strong>{sample.name}</strong>
              <span>{sample.description}</span>
            </button>
          ))}
        </div>
      </section>
      <div className="section-grid">
        <section className="card">
          <CardTitle icon={<CalendarDays size={20} />} title="Household settings" sub="Saved on this device" />
          <fieldset className="check-fields">
            <legend>Who should the plan consider?</legend>
            {checkboxFields.map(({ field, label }) => (
              <label key={field}>
                <input
                  type="checkbox"
                  name={field}
                  checked={profile[field]}
                  onChange={event => set(field, event.target.checked)}
                />
                {label}
              </label>
            ))}
          </fieldset>
          <div className="form-grid">
            {renderSelect('work', 'Work setting')}
            {renderSelect('commute', 'Usual commute')}
            {renderSelect('activity', 'Flexible activity')}
            {renderSelect('budget', 'Household budget')}
            {shiftFields.map(({ field, label }) => (
              <label key={field}>
                {label}
                <select
                  name={field}
                  value={profile[field]}
                  onChange={event => set(field, Number(event.target.value))}
                >
                  {WORK_HOURS.map(hour => (
                    <option key={hour} value={hour}>
                      {String(hour).padStart(2, '0')}:00
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <p className="muted text-sm mt-4">
            Choose the same start and end hour when your work has no fixed block. Overnight shifts are supported.
          </p>
        </section>
        <CleanerWindow env={env} now={now} profile={profile} loading={loading} showLink={false} />
      </div>
      <section className="card">
        <CardTitle
          icon={<ShieldCheck size={20} />}
          title="Daily household checklist"
          sub={`${city.name} · ${formatDate(now)}`}
        />
        <p className="checklist-progress" role="status">
          {done} of {actions.length} complete
        </p>
        <div className="action-list">
          {actions.map(action => {
            const isChecked = active.includes(action.id);
            return (
              <article key={action.id}>
                <label className="check-action">
                  <input
                    type="checkbox"
                    name={`check-${action.id}`}
                    checked={isChecked}
                    aria-label={`${action.title} completed`}
                    onChange={event => setChecked({
                      key,
                      ids: event.target.checked
                        ? [...new Set([...active, action.id])]
                        : active.filter(id => id !== action.id),
                    })}
                  />
                  <Check size={15} aria-hidden="true" />
                </label>
                <div>
                  <ActionText action={action} hindi={hindi} />
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
