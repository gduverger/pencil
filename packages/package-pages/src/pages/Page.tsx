import type { ReactNode } from 'react';
import { ROUNDING_FOOTNOTE } from '../format';
import type { Letterhead, VersionMeta } from '../types';
import type { ScenarioKey } from '@pencil/engine';

export interface PageFrameProps {
  pageKey: string;
  title: string;
  number: number;
  total: number;
  version: VersionMeta;
  letterhead?: Letterhead;
  scenario: ScenarioKey | 'all';
  landscape?: boolean;
  /** Fixed-height page (content must fit) versus a flowing page that may paginate. */
  fixed?: boolean;
  subtitle?: string;
  children: ReactNode;
}

export const SCENARIO_LABEL: Record<ScenarioKey | 'all', string> = {
  likely: 'Likely',
  best: 'Best',
  worst: 'Worst',
  all: 'Likely · Best · Worst',
};

export function PageFrame(p: PageFrameProps) {
  const cls = ['page', p.landscape ? 'landscape' : '', p.fixed === false ? '' : 'fixed']
    .filter(Boolean)
    .join(' ');
  return (
    <section className={cls} data-page={p.pageKey} aria-label={p.title}>
      <header className="page-header">
        <div className="brand">
          {p.letterhead?.imageUrl ? (
            <img src={p.letterhead.imageUrl} alt={p.letterhead.orgName} />
          ) : null}
          <div>
            <div className="org">{p.letterhead?.orgName ?? 'Pencil'}</div>
            {p.letterhead?.address ? <div className="addr">{p.letterhead.address}</div> : null}
          </div>
        </div>
        <div className="meta">
          <div className="deal">{p.version.dealName}</div>
          <div>{`Version ${p.version.versionNumber} · ${p.version.versionDate}`}</div>
          <div>{`Scenario: ${SCENARIO_LABEL[p.scenario]}`}</div>
        </div>
      </header>
      <h2 className="page-title">{p.title}</h2>
      {p.subtitle ? <p className="page-subtitle">{p.subtitle}</p> : null}
      {p.children}
      <footer className="page-footer">
        <span>{ROUNDING_FOOTNOTE}</span>
        <span>{`Page ${p.number} of ${p.total}`}</span>
      </footer>
    </section>
  );
}
