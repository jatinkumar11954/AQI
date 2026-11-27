import { useEffect, useRef, useState, type FormEvent } from 'react';
import { MapPin, Search, X } from 'lucide-react';
import { CITIES, type City } from '../shared/model';
import { environmentBudgetMs, searchCities } from './data';

type SearchState =
  | { status: 'idle' | 'pending' }
  | { status: 'complete'; places: City[]; query: string }
  | { status: 'error'; message: string };

function searchMessage(state: SearchState) {
  switch (state.status) {
    case 'idle': return '';
    case 'pending': return 'Searching Indian cities…';
    case 'error': return state.message;
    case 'complete': {
      const count = state.places.length;
      if (count === 1) return '1 matching city found.';
      if (count > 1) return `${count} matching cities found.`;
      return /^\d{6}$/.test(state.query)
        ? 'PIN code lookup is unavailable. Search by city or neighbourhood name, or choose a suggested city.'
        : 'No matches. Check the spelling or choose a suggested city.';
    }
  }
}

export function LocationDialog({ open, city, close, choose }: { open: boolean; city: City; close: () => void; choose: (city: City) => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<SearchState>({ status: 'idle' });

  useEffect(() => {
    const element = dialog.current;
    if (open && element && !element.open) {
      setQuery('');
      setState({ status: 'idle' });
      element.showModal();
      input.current?.focus();
    } else if (!open && element?.open) {
      element.close();
    }
    return () => request.current?.abort();
  }, [open]);

  function edit(value: string) {
    request.current?.abort();
    setQuery(value);
    setState({ status: 'idle' });
  }

  async function search(event: FormEvent) {
    event.preventDefault();
    request.current?.abort();
    const submitted = query.trim();
    const controller = new AbortController();
    request.current = controller;
    setState({ status: 'pending' });
    try {
      const places = await searchCities(submitted, AbortSignal.any([controller.signal, AbortSignal.timeout(environmentBudgetMs)]));
      if (!controller.signal.aborted) setState({ status: 'complete', places, query: submitted });
    } catch (cause) {
      if (!controller.signal.aborted) {
        const message = cause instanceof Error && cause.name !== 'TimeoutError'
          ? cause.message : 'City search timed out. The suggested cities are still available.';
        setState({ status: 'error', message });
      }
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  const places = state.status === 'complete' ? state.places : [];
  const busy = state.status === 'pending';
  return <dialog ref={dialog} className="location-dialog" aria-labelledby="location-title" onCancel={close} onClose={close}>
    <div className="card-heading"><span className="icon-tile" aria-hidden="true"><MapPin size={20} /></span><div className="card-heading-text"><h2 id="location-title">Choose your city</h2><p>Search Indian cities or neighbourhoods.</p></div>
      <button className="button icon-button" onClick={close} aria-label="Close location picker"><X size={18} /></button></div>
    <form className="search" onSubmit={search}>
      <label className="sr-only" htmlFor="city-search">City or neighbourhood</label>
      <input ref={input} id="city-search" name="city" value={query} onChange={event => edit(event.target.value)} maxLength={64} placeholder="e.g. Pune or Connaught Place" required minLength={2} />
      <button className="button primary" disabled={busy || query.trim().length < 2}><Search size={17} />{busy ? 'Searching' : 'Search'}</button>
    </form>
    <div role="status" aria-live="polite">{searchMessage(state)}</div>
    <p className="eyebrow results-label">{places.length ? 'SEARCH RESULTS' : 'SUGGESTED CITIES'}</p>
    <div className="place-grid">
      {(places.length ? places : CITIES).map(place => <button key={place.name + place.lat + place.lon} className="place" onClick={() => choose(place)} aria-pressed={place.lat === city.lat && place.lon === city.lon}>
        <strong>{place.name}</strong><span>{place.state}</span>
      </button>)}
    </div>
  </dialog>;
}
