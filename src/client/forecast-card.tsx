import { useState } from 'react';
import { Activity, ArrowDown, ArrowUp } from 'lucide-react';
import { HOUR, type AirPoint, type Environment } from '../shared/model';
import { dateKey, formatDate, formatTime, futureHours, risk } from '../shared/planner';
import { formatDateTime, formatNumber } from './format';
import { CardTitle } from './ui';

type MetricKey = 'aqi' | 'pm25' | 'pm10';

const METRICS = {
  aqi: { label: 'US AQI', units: '' },
  pm25: { label: 'PM2.5', units: ' µg/m³' },
  pm10: { label: 'PM10', units: ' µg/m³' },
} as const satisfies Record<MetricKey, { label: string; units: string }>;

const METRIC_KEYS = ['aqi', 'pm25', 'pm10'] as const satisfies readonly MetricKey[];

function parseMetric(value: string): MetricKey {
  if (value === 'pm25' || value === 'pm10') return value;
  return 'aqi';
}

function formatAxisLabel(point: AirPoint, duration: number, startDay: string, endDay: string): string {
  if (duration > 24 || startDay !== endDay) {
    return `${formatDate(point.time)}, ${formatTime(point.time)}`;
  }
  return formatTime(point.time);
}

/** Displays the 24h or 48h CAMS hourly forecast chart, hour inspector, and accessible data table. */
export function Forecast({ env, now, loading }: { env: Environment; now: number; loading: boolean }) {
  const [duration, setDuration] = useState(24);
  const [metric, setMetric] = useState<MetricKey>('aqi');
  const [chosen, setChosen] = useState<number | null>(null);
  const hours = futureHours(env, now, duration);
  const selected = hours.find(point => point.time === chosen) ?? hours[0];
  const shown = METRICS[metric];
  const finiteValues = hours.flatMap(point => {
    const value = point[metric];
    return value == null ? [] : [value];
  });
  const peak = finiteValues.length ? Math.max(...finiteValues) : 0;
  const max = Math.max(20, Math.ceil(peak / 50) * 50);
  const change = finiteValues.length > 1
    ? Math.round(finiteValues[finiteValues.length - 1] - finiteValues[0])
    : null;
  const detail = (point: AirPoint) => `${formatNumber(point[metric], 1)}${point[metric] == null ? '' : shown.units}`;
  const isStale = env.airStatus === 'stale' || (env.air != null && now - env.air.fetchedAt > HOUR);

  return (
    <section className="card forecast-card">
      <CardTitle
        icon={<Activity size={20} />}
        title="Hourly outlook"
        sub="CAMS forecast · Local time (IST)"
        right={(
          <div className="segmented" role="group" aria-label="Forecast range">
            {[24, 48].map(horizon => (
              <button key={horizon} aria-pressed={duration === horizon} onClick={() => setDuration(horizon)}>
                {horizon}h
              </button>
            ))}
          </div>
        )}
      />
      {isStale && <p className="notice">Forecast may be stale. Activity planning is paused.</p>}
      {finiteValues.length ? (
        <>
          <div className="forecast-tools">
            <label className="inline-label">
              Metric{' '}
              <select
                name="forecast-metric"
                aria-label="Forecast metric"
                value={metric}
                onChange={event => setMetric(parseMetric(event.target.value))}
              >
                {METRIC_KEYS.map(key => (
                  <option key={key} value={key}>{METRICS[key].label}</option>
                ))}
              </select>
            </label>
            {change != null && (
              <span className="trend">
                {change < 0 ? <ArrowDown size={15} /> : change > 0 ? <ArrowUp size={15} /> : null}
                {change === 0 ? 'No net change' : `${Math.abs(change)}${shown.units} ${change > 0 ? 'higher' : 'lower'} by last hour`}
              </span>
            )}
          </div>
          <figure className="chart" aria-label={`${shown.label} hourly bar chart`}>
            <div className="chart-main">
              <div className="chart-axis" aria-hidden="true">
                <span>{max}</span>
                <span>{max / 2}</span>
                <span>0</span>
              </div>
              <div className="chart-columns" aria-hidden="true">
                {hours.map(point => {
                  const value = point[metric];
                  const tone = metric === 'aqi' ? risk(point.aqi).tone : 'particle';
                  const isSelected = selected?.time === point.time ? ' selected' : '';
                  return (
                    <div
                      className="bar-slot"
                      key={point.time}
                      onPointerEnter={() => setChosen(point.time)}
                      onClick={() => setChosen(point.time)}
                    >
                      {value != null && (
                        <div
                          className={`bar ${tone}${isSelected}`}
                          style={{ height: `${Math.max(1, (value / max) * 100)}%` }}
                          title={`${formatDateTime(point.time)} · ${detail(point)}`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            <figcaption className="chart-caption">
              {[hours[0], hours[Math.floor(hours.length / 2)], hours[hours.length - 1]].map((point, index) => (
                <span key={index}>
                  {formatAxisLabel(
                    point,
                    duration,
                    dateKey(hours[0].time),
                    dateKey(hours[hours.length - 1].time),
                  )}
                </span>
              ))}
            </figcaption>
          </figure>
          <div className="chart-detail">
            <label className="inline-label">
              Hour{' '}
              <select
                name="forecast-hour"
                aria-label="Forecast hour"
                value={selected?.time ?? ''}
                onChange={event => setChosen(Number(event.target.value))}
              >
                {hours.map(point => (
                  <option key={point.time} value={point.time}>
                    {formatDate(point.time)} · {formatTime(point.time)}
                  </option>
                ))}
              </select>
            </label>
            {selected && <strong>{detail(selected)}</strong>}
          </div>
          <details className="details">
            <summary>View forecast as a table</summary>
            <div className="table-wrap" role="region" aria-label="Hourly forecast table" tabIndex={0}>
              <table>
                <caption className="sr-only">Hourly forecast in IST</caption>
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">US AQI</th>
                    <th scope="col">PM2.5 (µg/m³)</th>
                    <th scope="col">PM10 (µg/m³)</th>
                  </tr>
                </thead>
                <tbody>
                  {hours.map(point => (
                    <tr key={point.time}>
                      <th scope="row">{formatDateTime(point.time)}</th>
                      <td>{formatNumber(point.aqi)}</td>
                      <td>{formatNumber(point.pm25, 1)}</td>
                      <td>{formatNumber(point.pm10, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      ) : (
        <div className="empty chart-empty" role="status">
          {loading ? 'Loading hourly forecast…' : 'No hourly values available for this forecast and metric.'}
        </div>
      )}
    </section>
  );
}
