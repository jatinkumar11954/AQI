import { lazy, Suspense, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Activity, ArrowDownUp, ArrowRight, CalendarDays, ChevronDown, Compass, House, Info, Leaf, MapPin, RefreshCw, Sparkles, Wind } from 'lucide-react';
import { z } from 'zod';
import '@fontsource-variable/manrope';
import '@fontsource-variable/dm-sans';
import './styles.css';
import { CITIES, DEFAULT_PROFILE, citySchema, profileSchema, type City } from '../shared/model';
import { dateKey, formatDate } from '../shared/planner';
import { useAirReadings } from './use-air-readings';
import { AirOverview } from './overview';
import { LocationDialog } from './location-dialog';
import { SourceLink } from './ui';
import { useStored } from './use-stored';

const Assistant = lazy(() => import('./assistant-view').then(({ Assistant }) => ({ default: Assistant })));
const Improvement = lazy(() => import('./impact-view').then(({ Improvement }) => ({ default: Improvement })));
const Indoor = lazy(() => import('./indoor-view').then(({ Indoor }) => ({ default: Indoor })));
const Planner = lazy(() => import('./planner-view').then(({ Planner }) => ({ default: Planner })));

const pages = [
  { id: 'today', title: 'Today', icon: Compass },
  { id: 'planner', title: 'Daily planner', icon: CalendarDays },
  { id: 'indoor', title: 'Indoor air', icon: House },
  { id: 'impact', title: 'Impact simulator', icon: ArrowDownUp },
  { id: 'assistant', title: 'Ask SaansAI', icon: Sparkles },
] as const;
export type Page = typeof pages[number]['id'];
const headings: Record<Page, string> = {
  today: 'Your air plan today', planner: 'Plan your day', indoor: 'Make home air cleaner',
  impact: 'Compare your routines', assistant: 'Ask SaansAI',
};
const intros: Record<Page, string> = {
  today: 'What to do today, with local readings and forecasts to explain why.',
  planner: 'Build a routine around your household, work and local forecast.',
  indoor: 'Practical ways to reduce indoor pollution at every budget.',
  impact: 'Compare petrol use, travel costs and time spent outdoors.',
  assistant: 'Ask about your forecast, household plan or indoor air.',
};
const getPage = () => pages.find(item => '#' + item.id === window.location.hash)?.id ?? 'today';
const hindiSchema = z.boolean();

function App() {
  const [page, setPage] = useState<Page>(getPage);
  const [city, setCity] = useStored('saans:city', CITIES[0], citySchema);
  const [profile, setProfile] = useStored('saans:profile', DEFAULT_PROFILE, profileSchema);
  const [hindi, setHindi] = useStored('saans:hindi', false, hindiSchema);
  const [locationOpen, setLocationOpen] = useState(false);
  const { env, error, now, refreshing, slow, reloadData } = useAirReadings(city);
  const key = city.lat + ',' + city.lon;

  useEffect(() => {
    function onHash() {
      setPage(getPage());
      window.scrollTo({ top: 0 });
      requestAnimationFrame(() => document.getElementById('main-title')?.focus({ preventScroll: true }));
    }
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  function chooseCity(next: City) {
    setCity(next);
    setLocationOpen(false);
  }
  const shared = { env, now, profile, hindi };
  const loading = refreshing && !env.air;
  const dayKey = dateKey(now);
  const unavailable = !refreshing && env.airStatus === 'unavailable' && !env.station;
  const readingIssue = error || (unavailable ? 'Live air readings are temporarily unavailable.' : '');
  const readingStatus = slow ? 'Still connecting to the air data service. It may take about a minute after an idle period.'
    : readingIssue && `${readingIssue} ${env.air || env.station || env.india ? 'Showing the last data from this visit.' : 'General guidance is still available.'}`;
  return <>
    <a href="#main-title" className="skip" onClick={event => { event.preventDefault(); document.getElementById('main-title')?.focus(); }}>Skip to content</a>
    <div className="shell">
      <aside className="sidebar">
        <a className="brand" href="#today">
          <span className="mark"><Wind size={22} /></span>
          <span><strong>Saans<span>AI</span></strong><small>URBAN AIR ASSISTANT</small></span>
        </a>
        <nav className="navigation" aria-label="Main navigation">
          {pages.map(({ id, title, icon: Icon }) => <a key={id} href={'#' + id} aria-current={id === page ? 'page' : undefined}>
            <Icon size={19} /><span>{title}</span>
          </a>)}
        </nav>
        <div className="sidebar-bottom">
          <button className="source-button" onClick={() => {
            const target = document.getElementById('sources');
            const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            target?.scrollIntoView({ behavior: reducedMotion ? 'instant' : 'smooth', block: 'end' });
            target?.focus({ preventScroll: true });
          }}><Info size={18} /> Data &amp; methods</button>
          <div className="sidebar-note"><Leaf size={18} /><span>Built for Indian households</span></div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="breadcrumb"><Activity size={17} /> SaansAI <span>/</span> {pages.find(item => item.id === page)?.title}</span>
          <div className="top-actions">
            <button className="button location" aria-haspopup="dialog" aria-expanded={locationOpen} onClick={() => setLocationOpen(true)}><MapPin size={17} /><span>{city.name}, India</span><ChevronDown size={15} /></button>
            <button className="button language" aria-pressed={hindi} onClick={() => setHindi(!hindi)} aria-label="हिंदी — Toggle Hindi quick tips"><span lang="hi">हिंदी</span></button>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div><h1 id="main-title" tabIndex={-1}>{headings[page]}</h1><p>{intros[page]}</p></div>
            {page === 'today' && <button className="button refresh" disabled={refreshing} onClick={reloadData}>
              <RefreshCw size={16} className={refreshing ? 'spin' : ''} /> {refreshing ? 'Updating' : 'Refresh'}
            </button>}
          </div>
          <div className={readingStatus ? 'notice' : 'sr-only'}>
            <p role="status">{readingStatus}</p>
            {readingIssue && <button className="button mt-2" disabled={refreshing} onClick={reloadData}>Retry live readings</button>}
          </div>
          {page === 'today' && <AirOverview {...shared} city={city} loading={loading} />}
          <Suspense fallback={<p className="empty" role="status">Opening this section…</p>}>
          {page === 'planner' && <Planner {...shared} city={city} setProfile={setProfile} chooseCity={chooseCity} dayKey={dayKey} loading={loading} />}
          {page === 'indoor' && <Indoor {...shared} setProfile={setProfile} />}
          {page === 'impact' && <Improvement env={env} now={now} />}
          {page === 'assistant' && <Assistant key={key + JSON.stringify(profile)} city={city} profile={profile} hindi={hindi} env={env} />}
          </Suspense>
          <footer className="footer" id="sources" tabIndex={-1}>
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
const root = document.getElementById('root');
if (!root) throw new Error('SaansAI requires a root element.');
createRoot(root).render(<App />);
