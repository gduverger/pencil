/** Assembles the enabled pages in order (spec 8) with numbering and the per-page frame. */
import type { ReactNode } from 'react';
import { PageFrame } from './pages/Page';
import { SummaryPage } from './pages/Summary';
import { ReturnsPage } from './pages/Returns';
import { SourcesUsesPage } from './pages/SourcesUses';
import { CapitalBudgetPage } from './pages/CapitalBudget';
import { AnnualCashFlowPage } from './pages/AnnualCashFlow';
import { SaleAnalysisPage } from './pages/SaleAnalysis';
import { SensitivitiesPage } from './pages/Sensitivities';
import { AssumptionsPage } from './pages/Assumptions';
import { AppendixPage } from './pages/Appendix';
import { PAGE_KEYS, PAGE_TITLES, type PackageProps, type PageKey } from './types';
import type { ScenarioKey } from '@pencil/engine';

interface PlannedPage {
  key: PageKey;
  title: string;
  scenario: ScenarioKey | 'all';
  landscape: boolean;
  fixed: boolean;
  subtitle?: string;
  body: ReactNode;
}

/** The pages that will print, in order, given the settings. Exported so callers can count pages. */
export function planPages(props: PackageProps): PlannedPage[] {
  const { settings } = props;
  const pages: PlannedPage[] = [];
  const fresh = props.sensitivities.filter((s) => !s.stale);
  const stale = props.sensitivities.length - fresh.length;
  for (const key of PAGE_KEYS) {
    if (!settings.pages[key]) continue;
    switch (key) {
      case 'summary':
        pages.push({
          key,
          title: PAGE_TITLES[key],
          scenario: 'all',
          landscape: false,
          fixed: true,
          body: <SummaryPage props={props} />,
        });
        break;
      case 'returns':
        pages.push({
          key,
          title: PAGE_TITLES[key],
          scenario: 'all',
          landscape: false,
          fixed: true,
          body: <ReturnsPage props={props} />,
        });
        break;
      case 'sourcesUses':
        pages.push({
          key,
          title: PAGE_TITLES[key],
          scenario: settings.scenario,
          landscape: false,
          fixed: true,
          body: <SourcesUsesPage props={props} />,
        });
        break;
      case 'capitalBudget':
        pages.push({
          key,
          title: PAGE_TITLES[key],
          scenario: settings.scenario,
          landscape: false,
          fixed: false,
          body: <CapitalBudgetPage props={props} />,
        });
        break;
      case 'annualCashFlow':
        pages.push({
          key,
          title: PAGE_TITLES[key],
          scenario: settings.scenario,
          landscape: true,
          fixed: true,
          body: <AnnualCashFlowPage props={props} />,
        });
        break;
      case 'saleAnalysis':
        pages.push({
          key,
          title: PAGE_TITLES[key],
          scenario: settings.scenario,
          landscape: false,
          fixed: true,
          body: <SaleAnalysisPage props={props} />,
        });
        break;
      case 'sensitivities': {
        // One page per two grids; stale grids are omitted with a note on the first page.
        if (fresh.length === 0) {
          pages.push({
            key,
            title: PAGE_TITLES[key],
            scenario: settings.scenario,
            landscape: false,
            fixed: true,
            body: <SensitivitiesPage entries={[]} staleCount={stale} />,
          });
        }
        for (let i = 0; i < fresh.length; i += 2) {
          pages.push({
            key,
            title:
              fresh.length > 2
                ? `${PAGE_TITLES[key]} (${i / 2 + 1} of ${Math.ceil(fresh.length / 2)})`
                : PAGE_TITLES[key],
            scenario: settings.scenario,
            landscape: false,
            fixed: false,
            body: (
              <SensitivitiesPage entries={fresh.slice(i, i + 2)} staleCount={i === 0 ? stale : 0} />
            ),
          });
        }
        break;
      }
      case 'assumptions':
        pages.push({
          key,
          title: PAGE_TITLES[key],
          scenario: 'all',
          landscape: false,
          fixed: false,
          subtitle: 'Every input on the deal with its source, note, date and benchmark.',
          body: <AssumptionsPage register={props.register} />,
        });
        break;
      case 'appendix':
        pages.push({
          key,
          title: PAGE_TITLES[key],
          scenario: settings.scenario,
          landscape: true,
          fixed: !settings.includeMonthlyAppendix,
          body: <AppendixPage props={props} />,
        });
        break;
    }
  }
  return pages;
}

export function PackageDocument({ props }: { props: PackageProps }) {
  const pages = planPages(props);
  return (
    <div className="pkg-doc">
      {pages.map((p, i) => (
        <PageFrame
          key={`${p.key}-${i}`}
          pageKey={p.key}
          title={p.title}
          number={i + 1}
          total={pages.length}
          version={props.version}
          letterhead={props.letterhead}
          scenario={p.scenario}
          landscape={p.landscape}
          fixed={p.fixed}
          subtitle={p.subtitle}
        >
          {p.body}
        </PageFrame>
      ))}
    </div>
  );
}
