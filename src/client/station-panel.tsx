import { ArrowRight, RadioTower } from 'lucide-react';
import { OBSERVATION_MAX_AGE, type Environment, type IndiaStation, type Reading } from '../shared/model';
import { formatDateTime, formatNumber } from './format';
import { CardTitle, SourceLink } from './ui';

const STATION_STATUS_LABELS: Record<Environment['stationStatus'], string> = {
  unconfigured: 'Station readings are unavailable.',
  unavailable: 'Station readings are temporarily unavailable.',
  'no-station': 'No suitable reference monitor found within 25 km.',
  stale: 'The station feed or its latest readings may be stale.',
  fresh: 'Latest station report',
};

function IndiaReport({ station, stale }: { station: IndiaStation; stale: boolean }) {
  return (
    <div className="station-report">
      <h3>India-scale station AQI {formatNumber(station.aqi)}</h3>
      <p>
        <strong>{station.name}</strong> · {formatNumber(station.distance, 1)} km from city point
      </p>
      <p className="muted text-sm">
        {formatDateTime(station.time)}
        {stale ? ' · Stale report' : ''}. CPCB station data via India API.
      </p>
      <dl className="readings">
        <div>
          <dt>PM2.5 sub-index</dt>
          <dd><strong>{formatNumber(station.pm25Index)}</strong></dd>
        </div>
        <div>
          <dt>PM10 sub-index</dt>
          <dd><strong>{formatNumber(station.pm10Index)}</strong></dd>
        </div>
      </dl>
      <SourceLink id="relay" />
    </div>
  );
}

function ParticleReading({ reading, now }: { reading: Reading | null; now: number }) {
  if (!reading) return <span>Unavailable</span>;
  const older = now - reading.time > OBSERVATION_MAX_AGE;
  return (
    <span>
      <strong>{formatNumber(reading.value, 1)} µg/m³</strong>
      <small>
        {formatDateTime(reading.time)}
        {older ? ' · Older reading' : ''}
      </small>
    </span>
  );
}

/** Displays nearby ground-monitor station readings alongside official provenance links. */
export function StationPanel({ env, now, loading }: { env: Environment; now: number; loading: boolean }) {
  const { station, stationStatus } = env;

  return (
    <section className="card station-card">
      <CardTitle icon={<RadioTower size={20} />} title="Observed station data" sub="Separate from the CAMS model" />
      <p className="card-intro">
        {loading ? 'Retrieving nearby station reports…' : STATION_STATUS_LABELS[stationStatus]}
      </p>
      {station?.kind === 'openaq' && (
        <div className="station-report">
          <h3>OpenAQ measured concentrations</h3>
          <p>
            <strong>{station.name}</strong> · {formatNumber(station.distance, 1)} km from city point
            <br />
            <small>{station.owner} · via {station.provider}</small>
          </p>
          <dl className="readings">
            <div>
              <dt>PM2.5</dt>
              <dd><ParticleReading reading={station.pm25} now={now} /></dd>
            </div>
            <div>
              <dt>PM10</dt>
              <dd><ParticleReading reading={station.pm10} now={now} /></dd>
            </div>
          </dl>
          <a
            className="source-link"
            href={`https://explore.openaq.org/locations/${station.id}`}
            target="_blank"
            rel="noreferrer"
          >
            Open station <ArrowRight size={14} />
          </a>
        </div>
      )}
      {station?.kind === 'cpcb-relay' && (
        <IndiaReport station={station} stale={stationStatus === 'stale' || now - station.time > OBSERVATION_MAX_AGE} />
      )}
      {env.india && (
        <IndiaReport station={env.india.station} stale={env.india.status === 'stale' || now - env.india.station.time > OBSERVATION_MAX_AGE} />
      )}
      <p className="muted text-sm">
        Station readings can differ by location. Use CPCB for official India National AQI and advisories.
      </p>
      <SourceLink id="cpcb" />
    </section>
  );
}
