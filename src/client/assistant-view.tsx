import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CalendarDays, CircleHelp, House, Send, ShieldCheck, Sparkles } from 'lucide-react';
import { SOURCES, type City, type Environment, type Profile } from '../shared/model';
import { type Answer } from '../shared/assistant';
import { askSaansAI, assistantBudgetMs } from './data';
import { CardTitle, SourceLink } from './ui';

const prompts = ['Should I open the windows?', 'How should I adjust my commute?', 'Can the children play outside?', 'What can I do about cooking smoke?'];
const labels = { unconfigured: 'Gemini is unconfigured · Rules answer', quota: 'Gemini quota reached · Rules answer', unavailable: 'Gemini unavailable · Rules answer', privacy: 'Contact details kept out of Gemini · Rules answer' };

export function Assistant({ city, profile, hindi, env }: { city: City; profile: Profile; hindi: boolean; env: Environment }) {
  const [question, setQuestion] = useState('');
  const [entries, setEntries] = useState<{ id: number; question: string; answer: Answer }[]>([]);
  const [pending, setPending] = useState('');
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const nextId = useRef(1);
  const input = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  useEffect(() => () => {
    request.current?.abort();
    request.current = null;
  }, []);

  async function ask(text: string) {
    const value = text.trim();
    if (request.current || value.length < 2 || value.length > 350) return;
    const controller = new AbortController();
    request.current = controller;
    const id = nextId.current++;
    setError('');
    setQuestion('');
    setPending(value);
    setSlow(false);
    input.current?.focus();
    const wait = window.setTimeout(() => setSlow(true), 4500);
    const timeout = AbortSignal.timeout(assistantBudgetMs);
    try {
      const answer = await askSaansAI(value, city, profile, hindi ? 'hi' : 'en', env, AbortSignal.any([controller.signal, timeout]));
      if (!controller.signal.aborted) setEntries(previous => [...previous.slice(-7), { id, question: value, answer }]);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setQuestion(draft => draft || value);
        setError(timeout.aborted ? 'The question timed out. Try again.' : (cause instanceof Error ? cause.message : 'The assistant is unavailable.'));
      }
    } finally {
      window.clearTimeout(wait);
      if (request.current === controller) {
        request.current = null;
        setSlow(false);
        setPending('');
      }
    }
  }
  function cancel() {
    request.current?.abort();
    request.current = null;
    setQuestion(draft => draft || pending);
    setPending('');
    setSlow(false);
    input.current?.focus();
  }
  function submit(event: FormEvent) { event.preventDefault(); void ask(question); }

  return <div className="section-grid">
    <section className="card assistant-card">
      <CardTitle icon={<Sparkles size={20}/>} title="Your air assistant" sub={city.name + ' · Household settings applied'} />
      <div className="prompt-grid">{prompts.map(prompt => <button className="button" key={prompt} disabled={Boolean(pending)} onClick={() => void ask(prompt)}>{prompt}</button>)}</div>
      <div className="conversation" role="log" aria-label="Assistant responses">
        {entries.map(({ id, question: text, answer }) => <article key={id}>
          <div className="question-bubble">{text}</div>
          <div className="answer-bubble"><span className="eyebrow">{answer.mode === 'gemini' ? (answer.sources.length ? 'GEMINI · SOURCE-GROUNDED' : 'GEMINI · GUIDANCE SCOPE') : answer.status ? labels[answer.status] : 'Rules answer'}</span>
            <p>{answer.text}</p>{answer.followUp && <p>{answer.followUp}</p>}<p className="muted">{answer.context}</p>
            <div className="answer-sources">{answer.sources.map(id => <SourceLink key={id} id={id}/>)}</div></div>
        </article>)}
      </div>
      <div className={pending ? 'empty' : 'sr-only'}>
        <p role="status">{pending && (slow ? 'Still waiting for the assistant. The service can take longer after being idle.' : 'Checking your context…')}</p>
        {pending && <button className="button mt-2" type="button" onClick={cancel}>Cancel question</button>}
      </div>
      {error && <p className="notice" role="alert">{error}</p>}
      <form className="assistant-form" onSubmit={submit}>
        <label htmlFor={fieldId}>Your question</label>
        <div className="search"><input ref={input} id={fieldId} name="question" value={question} onChange={event => setQuestion(event.target.value)} maxLength={350} placeholder="Ask about your local air…" required minLength={2}/>
          <button className="button primary" disabled={Boolean(pending) || question.trim().length < 2}><Send size={17}/> Send</button></div>
      </form>
    </section>
    <section className="card">
      <CardTitle icon={<CircleHelp size={20}/>} title="How answers are grounded"/>
      <div className="guidance"><Signal icon={<CalendarDays size={18}/>}>Plans use your selected city, the current model and household settings.</Signal>
        <Signal icon={<ShieldCheck size={18}/>}>Gemini selects the guidance most relevant to your question and local conditions. SaansAI supplies the wording, sources and calculations.</Signal>
        <Signal icon={<House size={18}/>}>Questions and basic activity settings can be sent to Gemini. Keep names, addresses and medical information out of questions.</Signal></div>
      <SourceLink id="activity" short={SOURCES.activity.title} />
    </section>
  </div>;
}

function Signal({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div><span className="icon-tile">{icon}</span><p>{children}</p></div>;
}
