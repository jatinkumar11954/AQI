import { useState } from 'react';
import { Activity, ArrowDown, ArrowRight, ArrowUp, CalendarDays, ChevronRight, Clock3, Droplet, House, MapPin, RadioTower, ShieldCheck, Sparkles, Thermometer, Wind } from 'lucide-react';
import { HOUR, type AirPoint, type City, type Environment, type IndiaStation, type Profile, type Reading } from '../shared/model';
import { dailyActions, dateKey, findWindows, formatDate, formatTime, freshIndiaStation, futureHours, modelNow, nearbyParticleCaution, risk } from '../shared/planner';
import { CardTitle, SourceLink } from './ui';

type Shared = { env: Environment; now: number; profile: Profile; hindi: boolean };
const formats = [new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }), new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 })];
const format = (value: number | null | undefined, places: 0 | 1 = 0) => value == null ? '—' : formats[places].format(value);
const dateTime = (time: number) => `${formatDate(time)}, ${formatTime(time)} IST`;
const safeLead = (aqi: number | null, conflict: boolean, indiaAqi: number | null) => {
  if ((indiaAqi ?? 0) >= 401 || (aqi != null && aqi > 300)) return 'Avoid outdoor physical activity and follow local advisories.';
  if (aqi != null && aqi > 200) return 'Move strenuous activity indoors and limit non-essential outdoor time.';
  if (conflict) return 'A nearby station reports elevated pollution. Recheck local conditions before any optional outdoor activity.';
  if (aqi == null) return 'Check the official local AQI before planning outdoor activities.';
  if (aqi > 150) return 'Reduce prolonged outdoor exertion. Take extra care with children and older adults.';
  if (aqi > 100) return 'Sensitive groups should reduce prolonged or heavy outdoor exertion.';
  if (aqi > 50) return 'Check local conditions before strenuous activity, especially if you are sensitive to pollution.';
  return 'Check local conditions before heading out, especially near traffic.';
};

function Hero({ env, city, now, loading }: { env: Environment; city: City; now: number; loading: boolean }) {
  const current = modelNow(env, now);
  const last = env.air?.current;
  const value = current?.aqi ?? last?.aqi ?? null;
  const isCurrent = current?.aqi != null;
  const category = risk(value);
  return <section className="hero" aria-labelledby="hero-title">
    <div className="hero-top"><h2 id="hero-title" className="eyebrow"><MapPin size={15} /> {city.name.toUpperCase()}, INDIA</h2>
      <span className="feed-label"><span />{loading ? 'Updating model' : isCurrent ? 'Current model' : value != null ? 'Earlier model' : 'Feed unavailable'}</span>
    </div>
    <div className="readout"><strong>{format(value)}</strong><div><small>US AQI · CAMS</small><span className={'risk-pill ' + category.tone}>{category.label}</span></div></div>
    <div className="aqi-scale" aria-hidden="true">
      {['good', 'moderate', 'sensitive', 'unhealthy', 'very-unhealthy', 'hazardous'].map(tone => <div key={tone} className={tone}>{tone === category.tone && <span />}</div>)}
    </div>
    <p className="hero-advice">{loading ? 'Retrieving the current regional model and hourly outlook…' : safeLead(isCurrent ? value : null, nearbyParticleCaution(env, now), freshIndiaStation(env, now)?.aqi ?? null)}</p>
    <div className="hero-footer">
      <div><span>PM2.5</span><strong>{format((current ?? last)?.pm25, 1)} <small>µg/m³</small></strong></div>
      <div><span>PM10</span><strong>{format((current ?? last)?.pm10, 1)} <small>µg/m³</small></strong></div>
      <div className="model-time"><span>{isCurrent ? 'Model time' : 'Last model time'}</span><strong>{last ? dateTime(last.time) : '—'}</strong></div>
    </div>
  </section>;
}

export function CleanerWindow({ env, now, profile, loading = false, showLink = true }: Omit<Shared, 'hindi'> & { loading?: boolean; showLink?: boolean }) {
  const { lower, usable } = findWindows(env, profile, now);
  return <section className="card window-card">
    <CardTitle icon={<Clock3 size={20} />} title="Cleaner window" sub="Flexible outdoor plans" />
    <div className="window-note">
      <div className="eyebrow">{usable ? 'POSSIBLE TIME' : lower ? 'LOWEST ELIGIBLE FORECAST' : 'NEXT 24 HOURS'}</div>
      <strong>{loading ? 'Checking forecast…' : usable ? `${formatTime(usable.start)} – ${formatTime(usable.end)}` : 'No suitable window'}</strong>
      <p>{usable ? `${formatDate(usable.start)} · Peak modeled US AQI ${usable.peak}. Recheck before leaving.`
        : lower ? `The lowest peak for your schedule is ${lower.peak} US AQI on ${formatDate(lower.start)} at ${formatTime(lower.start)}. Conditions still call for caution.`
          : 'A fresh forecast and two eligible hours are needed to suggest a time.'}</p>
    </div>
    {showLink && <a href="#planner" className="text-link">Open your daily plan <ArrowRight size={16} /></a>}
  </section>;
}

const measurements = [
  { key: 'aqi', label: 'US AQI' }, { key: 'pm25', label: 'PM2.5' }, { key: 'pm10', label: 'PM10' },
] as const;
export function Forecast({ env, now, loading }: { env: Environment; now: number; loading: boolean }) {
  const [duration, setDuration] = useState(24);
  const [metric, setMetric] = useState<typeof measurements[number]['key']>('aqi');
  const [chosen, setChosen] = useState<number | null>(null);
  const hours = futureHours(env, now, duration);
  const selected = hours.find(point => point.time === chosen) ?? hours[0];
  const shown = measurements.find(item => item.key === metric)!;
  const finite = hours.filter(point => point[metric] != null);
  const peak = finite.length ? Math.max(...finite.map(point => point[metric]!)) : 0;
  const max = Math.max(20, Math.ceil(peak / 50) * 50);
  const first = finite[0];
  const last = finite[finite.length - 1];
  const change = finite.length > 1 ? Math.round(last[metric]! - first[metric]!) : null;
  const units = metric === 'aqi' ? '' : ' µg/m³';
  const detail = (point: AirPoint) => `${format(point[metric], 1)}${point[metric] == null ? '' : units}`;
  return <section className="card forecast-card">
    <CardTitle icon={<Activity size={20} />} title="Hourly outlook" sub="CAMS forecast · Local time (IST)" right={
      <div className="segmented" aria-label="Forecast range">
        {[24, 48].map(hours => <button key={hours} aria-pressed={duration === hours} onClick={() => setDuration(hours)}>{hours}h</button>)}
      </div>} />
    {(env.airStatus === 'stale' || (env.air && now - env.air.fetchedAt > HOUR)) && <p className="notice">Forecast may be stale. Activity planning is paused.</p>}
    {finite.length ? <>
      <div className="forecast-tools">
        <label className="inline-label">Metric <select name="forecast-metric" aria-label="Forecast metric" value={metric} onChange={event => setMetric(event.target.value as typeof metric)}>
          {measurements.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select></label>
        {change != null && <span className="trend">{change < 0 ? <ArrowDown size={15} /> : change > 0 ? <ArrowUp size={15} /> : null}
          {change === 0 ? 'No net change' : `${Math.abs(change)}${units} ${change > 0 ? 'higher' : 'lower'} by last hour`}</span>}
      </div>
      <figure className="chart" aria-label={shown.label + ' hourly bar chart'}>
        <div className="chart-main">
          <div className="chart-axis" aria-hidden="true"><span>{max}</span><span>{max / 2}</span><span>0</span></div>
          <div className="chart-columns" aria-hidden="true">
            {hours.map(point => <div className="bar-slot" key={point.time}
              onPointerEnter={() => setChosen(point.time)} onClick={() => setChosen(point.time)}>
              {point[metric] != null && <div className={'bar ' + (metric === 'aqi' ? risk(point.aqi).tone : 'particle') + (selected?.time === point.time ? ' selected' : '')}
                style={{ height: Math.max(1, (point[metric]! / max) * 100) + '%' }} title={`${dateTime(point.time)} · ${detail(point)}`} />}
            </div>)}
          </div>
        </div>
        <figcaption className="chart-caption">
          {[hours[0], hours[Math.floor(hours.length / 2)], hours[hours.length - 1]].map((point, index) => (
            <span key={index}>
              {duration > 24 || dateKey(hours[0].time) !== dateKey(hours[hours.length - 1].time)
                ? `${formatDate(point.time)}, ${formatTime(point.time)}`
                : formatTime(point.time)}
            </span>
          ))}
        </figcaption>
      </figure>
      <div className="chart-detail"><label className="inline-label">Hour <select name="forecast-hour" aria-label="Forecast hour" value={selected?.time ?? ''} onChange={event => setChosen(Number(event.target.value))}>
        {hours.map(point => <option key={point.time} value={point.time}>{formatDate(point.time)} · {formatTime(point.time)}</option>)}</select></label>
        {selected && <strong>{detail(selected)}</strong>}</div>
      <details className="details"><summary>View forecast as a table</summary>
        <div className="table-wrap"><table><caption className="sr-only">Hourly forecast in IST</caption><thead><tr><th scope="col">Time</th><th scope="col">US AQI</th><th scope="col">PM2.5 (µg/m³)</th><th scope="col">PM10 (µg/m³)</th></tr></thead>
          <tbody>{hours.map(point => <tr key={point.time}><th scope="row">{dateTime(point.time)}</th><td>{format(point.aqi)}</td><td>{format(point.pm25, 1)}</td><td>{format(point.pm10, 1)}</td></tr>)}</tbody>
        </table></div>
      </details>
    </> : <div className="empty chart-empty" role="status">{loading ? 'Loading hourly forecast…' : 'No hourly values available for this forecast and metric.'}</div>}
  </section>;
}

function IndiaReport({ station, stale }: { station: IndiaStation; stale: boolean }) {
  return <div className="station-report">
    <h3>India-scale station AQI {format(station.aqi)}</h3>
    <p><strong>{station.name}</strong> · {format(station.distance, 1)} km from city point</p>
    <p className="muted text-sm">{dateTime(station.time)}{stale ? ' · Stale report' : ''}. CPCB station data via India API.</p>
    <dl className="readings">
      <div><dt>PM2.5 sub-index</dt><dd><strong>{format(station.pm25Index)}</strong></dd></div>
      <div><dt>PM10 sub-index</dt><dd><strong>{format(station.pm10Index)}</strong></dd></div>
    </dl>
    <SourceLink id="relay" />
  </div>;
}

function StationPanel({ env, now, loading }: { env: Environment; now: number; loading: boolean }) {
  const { station, stationStatus } = env;
  const labels = {
    unconfigured: 'Station readings are unavailable.',
    unavailable: 'Station readings are temporarily unavailable.',
    'no-station': 'No suitable reference monitor found within 25 km.',
    stale: 'The station feed or its latest readings may be stale.',
    fresh: 'Latest station report',
  };
  const showReading = (reading: Reading | null) => reading
    ? <span><strong>{format(reading.value, 1)} µg/m³</strong><small>{dateTime(reading.time)}{now - reading.time > 3 * HOUR ? ' · Older reading' : ''}</small></span>
    : <span>Unavailable</span>;
  return <section className="card station-card">
    <CardTitle icon={<RadioTower size={20} />} title="Observed station data" sub="Separate from the CAMS model" />
    <p className="card-intro">{loading ? 'Retrieving nearby station reports…' : labels[stationStatus]}</p>
    {station?.kind === 'openaq' && <div className="station-report">
      <h3>OpenAQ measured concentrations</h3>
      <p><strong>{station.name}</strong> · {format(station.distance, 1)} km from city point<br /><small>{station.owner} · via {station.provider}</small></p>
      <dl className="readings"><div><dt>PM2.5</dt><dd>{showReading(station.pm25)}</dd></div><div><dt>PM10</dt><dd>{showReading(station.pm10)}</dd></div></dl>
      <a className="source-link" href={`https://explore.openaq.org/locations/${station.id}`} target="_blank" rel="noreferrer">Open station <ArrowRight size={14} /></a>
    </div>}
    {station?.kind === 'cpcb-relay' && <IndiaReport station={station} stale={stationStatus === 'stale' || now - station.time > 3 * HOUR} />}
    {env.india && <IndiaReport station={env.india.station} stale={env.india.status === 'stale' || now - env.india.station.time > 3 * HOUR} />}
    <p className="muted text-sm">Station readings can differ by location. Use CPCB for official India National AQI and advisories.</p>
    <SourceLink id="cpcb" />
  </section>;
}

export function AirOverview({ env, now, profile, hindi, city, loading }: Shared & { city: City; loading: boolean }) {
  const actions = dailyActions(env, profile, now);
  return <div className="dashboard">
    <section className="card actions-card">
      <CardTitle icon={<ShieldCheck size={20} />} title="Today’s actions" sub={city.name + ' · Based on your household settings'} />
      <div className="mini-actions">{[actions[0], actions[1], actions[3]].map((action, index) => {
        const Icon = [CalendarDays, Wind, House][index];
        return <a key={action.id} href={index === 2 ? '#indoor' : '#planner'} className="mini-action">
          <span><Icon size={17} /></span><div><strong>{action.title}</strong><p>{hindi && action.hindi ? <span lang="hi">{action.hindi}</span> : action.body}</p></div><ChevronRight size={15} />
        </a>;
      })}</div>
      <div className="plan-links">
        <a href="#planner" className="button primary">Personalise my plan <ArrowRight size={16} /></a>
        <a href="#assistant" className="text-link"><Sparkles size={16} /> Ask about your day <ArrowRight size={16} /></a>
      </div>
    </section>
    <CleanerWindow env={env} now={now} profile={profile} loading={loading} />
    <Hero env={env} city={city} now={now} loading={loading} />
    <StationPanel env={env} now={now} loading={loading} />
    <Forecast env={env} now={now} loading={loading} />
    <section className="card weather-card">
      <CardTitle icon={<Wind size={20} />} title="Local weather" sub={env.weather ? 'Open-Meteo model · ' + dateTime(env.weather.time) : 'Current weather estimate unavailable'} />
      <div className="weather-grid">
        <div><Thermometer size={19} /><span>Temperature</span><strong>{format(env.weather?.temperature, 1)} °C</strong></div>
        <div><Droplet size={19} /><span>Humidity</span><strong>{format(env.weather?.humidity)}%</strong></div>
        <div><Wind size={19} /><span>Wind</span><strong>{format(env.weather?.wind, 1)} km/h</strong></div>
      </div>
      <SourceLink id="weather" />
    </section>
  </div>;
}
