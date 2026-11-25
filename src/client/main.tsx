import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownUp, ArrowRight, CalendarDays, ChevronDown, Compass, House, Info, Leaf, MapPin, RefreshCw, Sparkles, Wind } from 'lucide-react';
import '@fontsource-variable/manrope';
import '@fontsource-variable/dm-sans';
import './styles.css';
import { CITIES, DEFAULT_PROFILE, EMPTY_ENV, citySchema, profileSchema, type City, type Environment, type Profile } from '../shared/model';
import { dateKey, formatDate } from '../shared/planner';
import { AirOverview } from './overview';
import { Assistant, Improvement, Indoor, Planner } from './sections';
import { LocationDialog, SourceLink, useStored } from './ui';

const pages = [
  { id: 'today', title: 'Today', icon: Compass },
  { id: 'planner', title: 'Daily planner', icon: CalendarDays },
  { id: 'indoor', title: 'Indoor air', icon: House },
  { id: 'impact', title: 'Impact simulator', icon: ArrowDownUp },
  { id: 'assistant', title: 'Ask SaansAI', icon: Sparkles },
] as const;
export type Page = typeof pages[number]['id'];
const headings: Record<Page, string> = {
  today: 'Air quality today', planner: 'Plan your day', indoor: 'Make home air cleaner',
  impact: 'Compare your routines', assistant: 'Ask SaansAI',
};
const intros: Record<Page, string> = {
  today: 'Your local air outlook and practical steps for the day ahead.',
  planner: 'Build a routine around your household, work and local forecast.',
  indoor: 'Practical ways to reduce indoor pollution at every budget.',
  impact: 'Compare petrol use, travel costs and time spent outdoors.',
  assistant: 'Ask about your forecast, household plan or indoor air.',
};
const getPage = () => pages.find(item => '#' + item.id === window.location.hash)?.id ?? 'today';
const stamp = () => Math.floor(Date.now() / 1000);

function App() {
  const [page, setPage] = useState<Page>(getPage);
  const [city, setCity] = useStored('saans:city', CITIES[0], citySchema);
  const [profile, setProfile] = useStored('saans:profile', DEFAULT_PROFILE, profileSchema);
  const [hindi, setHindi] = useStored<boolean>('saans:hindi', false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [selection, setSelection] = useState<{ key: string; data: Environment | null; error: string }>({ key: '', data: null, error: '' });
  const [refreshing, setRefreshing] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [now, setNow] = useState(stamp);
  const key = city.lat + ',' + city.lon;
  const env = selection.key === key && selection.data ? selection.data : EMPTY_ENV;
  const error = selection.key === key ? selection.error : '';

  useEffect(() => {
    function onHash() {
      setPage(getPage());
      window.scrollTo({ top: 0 });
      requestAnimationFrame(() => document.getElementById('main-title')?.focus({ preventScroll: true }));
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const tick = window.setInterval(() => setNow(stamp()), 60_000);
    const update = window.setInterval(() => setRefresh(value => value + 1), 9 * 60_000);
    return () => { window.clearInterval(tick); window.clearInterval(update); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setRefreshing(true);
    const networkLimit = AbortSignal.timeout(12_000);
    fetch('/api/environment?' + new URLSearchParams({ lat: String(city.lat), lon: String(city.lon) }), {
      signal: AbortSignal.any([controller.signal, networkLimit]),
    }).then(async response => {
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'Air data could not be loaded.');
      }
      return response.json() as Promise<Environment>;
    }).then(data => {
      if (!controller.signal.aborted) setSelection({ key, data, error: '' });
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setSelection(previous => ({
        key, data: previous.key === key && previous.data ? { ...previous.data, airStatus: 'stale', stationStatus: previous.data.station ? 'stale' : previous.data.stationStatus, weather: null } : null,
        error: networkLimit.aborted ? 'The data request timed out.' : error.message,
      }));
    }).finally(() => {
      if (!controller.signal.aborted) { setRefreshing(false); setNow(stamp()); }
    });
    return () => controller.abort();
  }, [city.lat, city.lon, key, refresh]);

  function chooseCity(next: City) {
    if (next.lat !== city.lat || next.lon !== city.lon) setRefreshing(true);
    setCity(next);
    setLocationOpen(false);
  }
  const shared = { env, now, profile, hindi };
  const loading = refreshing && !env.air;
  const dayKey = dateKey(now);
  return <>
    <a href="#main-title" className="skip" onClick={event => { event.preventDefault(); document.getElementById('main-title')?.focus(); }}>Skip to content</a>
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#today" aria-label="SaansAI home">
          <span className="mark"><Wind size={22} /></span>
          <span><strong>Saans<span>AI</span></strong><small>URBAN AIR ASSISTANT</small></span>
        </a>
        <nav className="navigation" aria-label="Main navigation">
          {pages.map(({ id, title, icon: Icon }) => <a key={id} href={'#' + id} aria-current={id === page ? 'page' : undefined}>
            <Icon size={19} /><span>{title}</span>
          </a>)}
        </nav>
        <div className="sidebar-bottom">
          <button className="source-button" onClick={() => document.getElementById('sources')?.scrollIntoView()}><Info size={18} /> Data &amp; methods</button>
          <div className="sidebar-note"><Leaf size={18} /><span>Built for Indian households</span></div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb"><Activity size={17} /> SaansAI <span>/</span> {pages.find(item => item.id === page)?.title}</span>
          <div className="top-actions">
            <button className="button location" onClick={() => setLocationOpen(true)}><MapPin size={17} /><span>{city.name}, India</span><ChevronDown size={15} /></button>
            <button className="button language" aria-pressed={hindi} onClick={() => setHindi(!hindi)} aria-label="Toggle Hindi quick tips">हिंदी</button>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div><h1 id="main-title" tabIndex={-1}>{headings[page]}</h1><p>{intros[page]}</p></div>
            {page === 'today' && <button className="button refresh" disabled={refreshing} onClick={() => { setRefreshing(true); setRefresh(value => value + 1); }}>
              <RefreshCw size={16} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Updating' : 'Refresh'}
            </button>}
          </div>
          {error && <div className="notice" role="alert">{error} {env.air ? 'Showing the last data from this visit.' : 'General guidance is still available.'}</div>}
          {page === 'today' && <AirOverview {...shared} city={city} loading={loading} />}
          {page === 'planner' && <Planner {...shared} city={city} setProfile={setProfile} chooseCity={chooseCity} dayKey={dayKey} loading={loading} />}
          {page === 'indoor' && <Indoor {...shared} setProfile={setProfile} />}
          {page === 'impact' && <Improvement env={env} now={now} />}
          {page === 'assistant' && <Assistant key={key + JSON.stringify(profile) + String(hindi)} city={city} profile={profile} hindi={hindi} />}
          <footer className="footer" id="sources">
            <div><strong>SaansAI</strong><span>{formatDate(now)} · All times in IST</span></div>
            <div><SourceLink id="model" short="Open-Meteo / CAMS" /><SourceLink id="openaq" short="OpenAQ" /><SourceLink id="cpcb" short="CPCB" /><SourceLink id="aqi" short="US AQI scale" /></div>
          </footer>
        </main>
      </div>
      {page !== 'assistant' && <a className="mobile-ask" href="#assistant"><Sparkles size={18} /> Ask SaansAI <ArrowRight size={15}/></a>}
    </div>
    <LocationDialog open={locationOpen} city={city} close={() => setLocationOpen(false)} choose={chooseCity} />
  </>;
}
createRoot(document.getElementById('root')!).render(<App />);
