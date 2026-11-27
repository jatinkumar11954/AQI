import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ArrowUpRight, MapPin, Search, X } from 'lucide-react';
import { environmentBudgetMs, searchCities } from './data';
import { CITIES, SOURCES, type City, type SourceId } from '../shared/model';

export function useStored<T>(key: string, initial: T, schema?: { parse(value: unknown): T }) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return initial;
      const parsed = JSON.parse(raw);
      return schema ? schema.parse(parsed) : typeof parsed === typeof initial ? parsed : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage can be unavailable */ }
  }, [key, value]);
  return [value, setValue] as const;
}

export function SourceLink({ id, short }: { id: SourceId; short?: string }) {
  return <a className="source-link" href={SOURCES[id].url} target="_blank" rel="noreferrer">{short ?? SOURCES[id].title}<ArrowUpRight size={13} aria-hidden="true" /></a>;
}

export function CardTitle({ icon, title, sub, right }: { icon: ReactNode; title: string; sub?: string; right?: ReactNode }) {
  return <div className="card-heading">
    <span className="icon-tile" aria-hidden="true">{icon}</span>
    <div className="card-heading-text"><h2>{title}</h2>{sub && <p>{sub}</p>}</div>
    {right}
  </div>;
}

export function LocationDialog({ open, city, close, choose }: { open: boolean; city: City; close: () => void; choose: (city: City) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [query, setQuery] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [results, setResults] = useState<City[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) {
      setQuery(''); setSubmittedQuery(''); setResults(null); setError(''); setBusy(false);
      element.showModal();
      input.current?.focus();
    } else if (!open && element?.open) {
      request.current?.abort();
      element.close();
    }
    return () => request.current?.abort();
  }, [open]);

  async function search(event: FormEvent) {
    event.preventDefault();
    request.current?.abort();
    const trimmed = query.trim();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true); setError(''); setResults(null); setSubmittedQuery(trimmed);
    try {
      const places = await searchCities(trimmed, AbortSignal.any([controller.signal, AbortSignal.timeout(environmentBudgetMs)]));
      if (!controller.signal.aborted) setResults(places);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error && cause.name !== 'TimeoutError' ? cause.message : 'City search timed out. The suggested cities are still available.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return <dialog ref={dialog} className="location-dialog" aria-labelledby="location-title" onCancel={close} onClose={close}>
    <div className="card-heading"><span className="icon-tile"><MapPin size={20} /></span><div className="card-heading-text"><h2 id="location-title">Choose your city</h2><p>Search Indian cities or neighbourhoods.</p></div>
      <button className="button icon-button" onClick={close} aria-label="Close location picker"><X size={18} /></button></div>
    <form className="search" onSubmit={search}>
      <label className="sr-only" htmlFor="city-search">City or neighbourhood</label>
      <input ref={input} id="city-search" name="city" value={query} onChange={event => setQuery(event.target.value)} maxLength={64} placeholder="e.g. Pune or Connaught Place" required minLength={2} />
      <button className="button primary" disabled={busy || query.trim().length < 2}><Search size={17} />{busy ? 'Searching' : 'Search'}</button>
    </form>
    <div aria-live="polite">{error || (busy ? 'Searching Indian cities…' : results?.length === 0 ? (/^\d{6}$/.test(submittedQuery) ? 'PIN code lookup is unavailable. Search by city or neighbourhood name, or choose a suggested city.' : 'No matches. Check the spelling or choose a suggested city.') : '')}</div>
    <p className="eyebrow results-label">{results?.length ? 'SEARCH RESULTS' : 'SUGGESTED CITIES'}</p>
    <div className="place-grid">
      {(results?.length ? results : CITIES).map(place => <button key={place.name + place.lat + place.lon} className="place" onClick={() => choose(place)} aria-pressed={place.lat === city.lat && place.lon === city.lon}>
        <strong>{place.name}</strong><span>{place.state}</span>
      </button>)}
    </div>
  </dialog>;
}
