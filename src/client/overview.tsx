import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Clock3,
  Droplet,
  House,
  MapPin,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Wind,
} from 'lucide-react';
import { type City, type Environment, type Profile } from '../shared/model';
import {
  dailyActions,
  findWindows,
  formatDate,
  formatTime,
  freshIndiaStation,
  isSensitive,
  modelNow,
  nearbyParticleCaution,
  risk,
} from '../shared/planner';
import { Forecast } from './forecast-card';
import { formatDateTime, formatNumber } from './format';
import { StationPanel } from './station-panel';
import { CardTitle, SourceLink } from './ui';

type Shared = { env: Environment; now: number; profile: Profile; hindi: boolean };

const SCALE_TONES = ['good', 'moderate', 'sensitive', 'unhealthy', 'very-unhealthy', 'hazardous'] as const;

function safeLead(aqi: number | null, conflict: boolean, indiaAqi: number | null): string {
  if ((indiaAqi ?? 0) >= 401 || (aqi != null && aqi > 300)) {
    return 'Avoid outdoor physical activity and follow local advisories.';
  }
  if (aqi != null && aqi > 200) {
    return 'Move strenuous activity indoors and limit non-essential outdoor time.';
  }
  if (conflict) {
    return 'A nearby station reports elevated pollution. Recheck local conditions before any optional outdoor activity.';
  }
  if (aqi == null) return 'Check the official local AQI before planning outdoor activities.';
  if (aqi > 150) return 'Reduce prolonged outdoor exertion. Take extra care with children and older adults.';
  if (aqi > 100) return 'Sensitive groups should reduce prolonged or heavy outdoor exertion.';
  if (aqi > 50) return 'Check local conditions before strenuous activity, especially if you are sensitive to pollution.';
  return 'Check local conditions before heading out, especially near traffic.';
}

function Hero({ env, city, now, loading }: { env: Environment; city: City; now: number; loading: boolean }) {
  const current = modelNow(env, now);
  const last = env.air?.current;
  const value = current?.aqi ?? last?.aqi ?? null;
  const isCurrent = current?.aqi != null;
  const category = risk(value);
  const feedLabel = loading
    ? 'Updating model'
    : isCurrent
      ? 'Current model'
      : value != null
        ? 'Earlier model'
        : 'Feed unavailable';

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div className="hero-top">
        <h2 id="hero-title" className="eyebrow">
          <MapPin size={15} /> {city.name.toUpperCase()}, INDIA
        </h2>
        <span className="feed-label">
          <span />
          {feedLabel}
        </span>
      </div>
      <div className="readout">
        <strong>{formatNumber(value)}</strong>
        <div>
          <small>US AQI · CAMS</small>
          <span className={`risk-pill ${category.tone}`}>{category.label}</span>
        </div>
      </div>
      <div className="aqi-scale" aria-hidden="true">
        {SCALE_TONES.map(tone => (
          <div key={tone} className={tone}>
            {tone === category.tone && <span />}
          </div>
        ))}
      </div>
      <p className="hero-advice">
        {loading
          ? 'Retrieving the current regional model and hourly outlook…'
          : safeLead(isCurrent ? value : null, nearbyParticleCaution(env, now), freshIndiaStation(env, now)?.aqi ?? null)}
      </p>
      <div className="hero-footer">
        <div>
          <span>PM2.5</span>
          <strong>
            {formatNumber((current ?? last)?.pm25, 1)} <small>µg/m³</small>
          </strong>
        </div>
        <div>
          <span>PM10</span>
          <strong>
            {formatNumber((current ?? last)?.pm10, 1)} <small>µg/m³</small>
          </strong>
        </div>
        <div className="model-time">
          <span>{isCurrent ? 'Model time' : 'Last model time'}</span>
          <strong>{last ? formatDateTime(last.time) : '—'}</strong>
        </div>
      </div>
    </section>
  );
}

/** Highlights the best upcoming 2-hour outdoor window or explains why none meets the household screen. */
export function CleanerWindow({
  env,
  now,
  profile,
  loading = false,
  showLink = true,
}: Omit<Shared, 'hindi'> & { loading?: boolean; showLink?: boolean }) {
  const { lower, usable } = findWindows(env, profile, now);
  const ceiling = isSensitive(profile) || profile.activity !== 'errands' ? 50 : 100;
  const heading = usable ? 'POSSIBLE TIME' : lower ? 'LOWEST ELIGIBLE FORECAST' : 'NEXT 24 HOURS';
  const summary = loading
    ? 'Checking forecast…'
    : usable
      ? `${formatTime(usable.start)} – ${formatTime(usable.end)}`
      : 'No suitable window';
  const detail = usable
    ? `${formatDate(usable.start)} · Peak modeled US AQI ${usable.peak}. Recheck before leaving.`
    : lower
      ? `The lowest peak for your schedule is ${lower.peak} US AQI on ${formatDate(lower.start)} at ${formatTime(lower.start)} (your profile screen requires ≤ ${ceiling} US AQI without nearby station caution).`
      : 'A fresh forecast and two eligible hours are needed to suggest a time.';

  return (
    <section className="card window-card">
      <CardTitle icon={<Clock3 size={20} />} title="Cleaner window" sub="Flexible outdoor plans" />
      <div className="window-note">
        <div className="eyebrow">{heading}</div>
        <strong>{summary}</strong>
        <p>{detail}</p>
      </div>
      {showLink && (
        <a href="#planner" className="text-link">
          Open your daily plan <ArrowRight size={16} />
        </a>
      )}
    </section>
  );
}

function WeatherCard({ env }: { env: Environment }) {
  return (
    <section className="card weather-card">
      <CardTitle
        icon={<Wind size={20} />}
        title="Local weather"
        sub={env.weather ? `Open-Meteo model · ${formatDateTime(env.weather.time)}` : 'Current weather estimate unavailable'}
      />
      <div className="weather-grid">
        <div>
          <Thermometer size={19} />
          <span>Temperature</span>
          <strong>{formatNumber(env.weather?.temperature, 1)} °C</strong>
        </div>
        <div>
          <Droplet size={19} />
          <span>Humidity</span>
          <strong>{formatNumber(env.weather?.humidity)}%</strong>
        </div>
        <div>
          <Wind size={19} />
          <span>Wind</span>
          <strong>{formatNumber(env.weather?.wind, 1)} km/h</strong>
        </div>
      </div>
      <SourceLink id="weather" />
    </section>
  );
}

/** Renders the main Today dashboard combining current conditions, cleaner windows, station telemetry, and outlook. */
export function AirOverview({ env, now, profile, hindi, city, loading }: Shared & { city: City; loading: boolean }) {
  const actions = dailyActions(env, profile, now);
  const summaryCards = [
    { action: actions[0], href: '#planner', Icon: CalendarDays },
    { action: actions[1], href: '#planner', Icon: Wind },
    { action: actions[3], href: '#indoor', Icon: House },
  ];

  return (
    <div className="dashboard">
      <section className="card actions-card">
        <CardTitle
          icon={<ShieldCheck size={20} />}
          title="Today’s actions"
          sub={`${city.name} · Based on your household settings`}
        />
        <div className="mini-actions">
          {summaryCards.map(({ action, href, Icon }) => (
            <a key={action.id} href={href} className="mini-action">
              <span>
                <Icon size={17} />
              </span>
              <div>
                <strong>{action.title}</strong>
                <p>{hindi && action.hindi ? <span lang="hi">{action.hindi}</span> : action.body}</p>
              </div>
              <ChevronRight size={15} />
            </a>
          ))}
        </div>
        <div className="plan-links">
          <a href="#planner" className="button primary">
            Personalise my plan <ArrowRight size={16} />
          </a>
          <a href="#assistant" className="text-link">
            <Sparkles size={16} /> Ask about your day <ArrowRight size={16} />
          </a>
        </div>
      </section>
      <CleanerWindow env={env} now={now} profile={profile} loading={loading} />
      <Hero env={env} city={city} now={now} loading={loading} />
      <StationPanel env={env} now={now} loading={loading} />
      <Forecast env={env} now={now} loading={loading} />
      <WeatherCard env={env} />
    </div>
  );
}
