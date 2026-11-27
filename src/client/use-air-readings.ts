import { useEffect, useState } from 'react';
import { EMPTY_ENV, type City, type Environment } from '../shared/model';
import { environmentBudgetMs, readEnvironment } from './data';

type Readings = { location: string; data: Environment | null; error: string };
const stamp = () => Math.floor(Date.now() / 1000);

function markStale(data: Environment): Environment {
  return {
    ...data,
    airStatus: 'stale',
    stationStatus: data.station ? 'stale' : data.stationStatus,
    india: data.india ? { ...data.india, status: 'stale' } : undefined,
    weather: null,
  };
}

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
        if (!request.signal.aborted) setReadings({ location, data, error: '' });
      } catch (cause) {
        if (request.signal.aborted) return;
        const error = timeout.aborted ? 'The data service did not respond in time.'
          : cause instanceof Error ? cause.message : 'The air data service is unavailable.';
        setReadings(previous => ({
          location,
          data: previous.location === location && previous.data ? markStale(previous.data) : null,
          error,
        }));
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
