import { useEffect, useState } from 'react';
import { EMPTY_ENV, type City, type Environment } from '../shared/model';
import { environmentBudgetMs, readEnvironment } from './data';

type Readings = { location: string; data: Environment | null; error: string };
const stamp = () => Math.floor(Date.now() / 1000);

function markStale(data: Environment): Environment {
  return {
    ...data,
    airStatus: data.air ? 'stale' : data.airStatus,
    stationStatus: data.station ? 'stale' : data.stationStatus,
    india: data.india ? { ...data.india, status: 'stale' } : undefined,
    weather: null,
  };
}

function applyEmptyResponse(previous: Readings, location: string, data: Environment): Readings {
  const earlier = previous.location === location ? previous.data : null;
  if (earlier && (earlier.air || earlier.station || earlier.india)) {
    return { location, data: markStale(earlier), error: 'Live air readings are temporarily unavailable.' };
  }
  return { location, data, error: '' };
}

function applyErrorResponse(previous: Readings, location: string, error: string): Readings {
  const earlier = previous.location === location ? previous.data : null;
  return { location, data: earlier ? markStale(earlier) : null, error };
}

/** Manages per-location air-reading fetches, abort/timeout recovery, stale fallback, and periodic refresh. */
export function useAirReadings(city: City) {
  const { lat, lon } = city;
  const location = `${lat},${lon}`;
  const [readings, setReadings] = useState<Readings>({ location: '', data: null, error: '' });
  const [refreshing, setRefreshing] = useState(true);
  const [slow, setSlow] = useState(false);
  const [revision, setRevision] = useState(0);
  const [now, setNow] = useState(stamp);

  useEffect(() => {
    const tick = window.setInterval(() => setNow(stamp()), 60_000);
    const refresh = window.setInterval(() => {
      if (document.visibilityState === 'visible') setRevision(value => value + 1);
    }, 9 * 60_000);
    return () => {
      window.clearInterval(tick);
      window.clearInterval(refresh);
    };
  }, []);

  useEffect(() => {
    const request = new AbortController();
    const timeout = AbortSignal.timeout(environmentBudgetMs);
    const wait = window.setTimeout(() => setSlow(true), 2_800);
    setRefreshing(true);
    setSlow(false);

    async function load() {
      try {
        const data = await readEnvironment({ lat, lon }, AbortSignal.any([request.signal, timeout]));
        if (request.signal.aborted) return;
        const hasAnyFeed = Boolean(data.air || data.station || data.india || data.weather);
        setReadings(previous =>
          hasAnyFeed ? { location, data, error: '' } : applyEmptyResponse(previous, location, data),
        );
      } catch (cause) {
        if (request.signal.aborted) return;
        const error = timeout.aborted
          ? 'The data service did not respond in time.'
          : cause instanceof Error ? cause.message : 'The air data service is unavailable.';
        setReadings(previous => applyErrorResponse(previous, location, error));
      } finally {
        window.clearTimeout(wait);
        if (!request.signal.aborted) {
          setRefreshing(false);
          setSlow(false);
          setNow(stamp());
        }
      }
    }

    void load();
    return () => {
      window.clearTimeout(wait);
      request.abort();
    };
  }, [lat, lon, location, revision]);

  const sameLocation = readings.location === location;
  return {
    env: (sameLocation && readings.data) || EMPTY_ENV,
    error: sameLocation ? readings.error : '',
    refreshing: !sameLocation || refreshing,
    slow,
    now,
    reloadData() {
      setRefreshing(true);
      setRevision(value => value + 1);
    },
  };
}
