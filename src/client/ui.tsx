import { type ReactNode } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { SOURCES, type SourceId } from '../shared/model';

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
