import type { DealOutputs, ScenarioKey } from '@pencil/engine';
import { NoiDebtServiceChart } from '../charts';
import {
  formatInteger,
  formatIrr,
  formatMultiple,
  formatPct,
  formatUsd,
  formatUsdPerSF,
  formatUsdWhole,
} from '../format';
import type { PackageProps } from '../types';

const KEYS: ScenarioKey[] = ['likely', 'best', 'worst'];

export function SummaryPage({ props }: { props: PackageProps }) {
  const { outputs, settings, version, site } = props;
  const likely = outputs.likely;
  const p = likely.program;
  const mix = p.unitTypes
    .filter((u) => u.units > 0)
    .map((u) => `${u.units} × ${u.key}`)
    .join(', ');
  const row = (label: string, f: (o: DealOutputs) => string) => (
    <tr key={label}>
      <td className="label">{label}</td>
      {KEYS.map((k) => (
        <td key={k} className="num">
          {f(outputs[k])}
        </td>
      ))}
    </tr>
  );
  const range = (f: (o: DealOutputs) => number | null, fmt: (x: number | null) => string) => {
    const vals = KEYS.map((k) => f(outputs[k]));
    const defined = vals.filter((v): v is number => v !== null);
    if (defined.length === 0) return 'n/a';
    return `${fmt(Math.min(...defined))} – ${fmt(Math.max(...defined))}`;
  };
  return (
    <>
      <div className="cols">
        <div className="col-narrow">
          <h3>Site</h3>
          <dl className="facts">
            <dt>Address</dt>
            <dd>{site?.address ?? '—'}</dd>
            <dt>Town</dt>
            <dd>{site?.town ?? '—'}</dd>
            <dt>Lot area</dt>
            <dd>
              {likely.inputs.site.lotSF > 0 ? `${formatInteger(likely.inputs.site.lotSF)} SF` : '—'}
            </dd>
            <dt>Zoning</dt>
            <dd>{likely.inputs.site.zoningDistrict ?? site?.zoningDistrict ?? '—'}</dd>
            <dt>MBTA Communities</dt>
            <dd>
              {likely.inputs.site.mbtaCommunitiesDistrict === undefined
                ? '—'
                : likely.inputs.site.mbtaCommunitiesDistrict
                  ? 'Yes'
                  : 'No'}
            </dd>
            {site?.assessedValue !== undefined ? (
              <>
                <dt>Assessed value</dt>
                <dd>{formatUsd(site.assessedValue)}</dd>
              </>
            ) : null}
            {site?.annualTax !== undefined ? (
              <>
                <dt>Current annual tax</dt>
                <dd>{formatUsd(site.annualTax)}</dd>
              </>
            ) : null}
          </dl>
          <h3>Program</h3>
          <dl className="facts">
            <dt>Units</dt>
            <dd>{formatInteger(p.totalUnits)}</dd>
            <dt>Mix</dt>
            <dd>{mix}</dd>
            <dt>Net rentable SF</dt>
            <dd>{formatInteger(p.nrsf)}</dd>
            <dt>Gross SF</dt>
            <dd>
              {formatInteger(p.gsfTotal)}
              {p.commercialSF > 0 ? ` (incl. ${formatInteger(p.commercialSF)} commercial)` : ''}
            </dd>
            <dt>Timeline</dt>
            <dd>{`${likely.timeline.P} + ${likely.timeline.O - likely.timeline.P} + ${likely.timeline.Z - likely.timeline.O} months to stabilization`}</dd>
            <dt>Hold period</dt>
            <dd>{`${likely.timeline.S} months (${(likely.timeline.S / 12).toFixed(1)} years)`}</dd>
          </dl>
        </div>
        <div className="col-wide">
          <div className="hero">
            <div className="tile">
              <div className="k">Project IRR</div>
              <div className="v">{formatIrr(likely.metrics.projectIrr)}</div>
              <div className="range">{`Range ${range((o) => o.metrics.projectIrr, formatIrr)}`}</div>
            </div>
            <div className="tile">
              <div className="k">LP IRR</div>
              <div className="v">{formatIrr(likely.metrics.lpIrr)}</div>
              <div className="range">{`Range ${range((o) => o.metrics.lpIrr, formatIrr)}`}</div>
            </div>
            <div className="tile">
              <div className="k">Yield on cost</div>
              <div className="v">{formatPct(likely.metrics.yieldOnCost)}</div>
              <div className="range">{`Range ${range((o) => o.metrics.yieldOnCost, formatPct)}`}</div>
            </div>
          </div>
          <table className="t">
            <thead>
              <tr>
                <th>Headline</th>
                <th className="num">Likely</th>
                <th className="num">Best</th>
                <th className="num">Worst</th>
              </tr>
            </thead>
            <tbody>
              {row('Project IRR', (o) => formatIrr(o.metrics.projectIrr))}
              {row('LP IRR', (o) => formatIrr(o.metrics.lpIrr))}
              {row('Equity multiple', (o) => formatMultiple(o.metrics.equityMultiple))}
              {row('Yield on cost', (o) => formatPct(o.metrics.yieldOnCost))}
              {row('Total project cost', (o) => formatUsd(o.totals.tpc))}
              {row('Cost per unit', (o) => formatUsdWhole(o.metrics.costPerUnit))}
              {row('Cost per gross SF', (o) => formatUsdPerSF(o.metrics.costPerGSF))}
            </tbody>
          </table>
          <p className="footnote">Figures rounded; totals may not foot.</p>
        </div>
      </div>
      <div className="narrative">
        <div className="label">
          {settings.narrative
            ? settings.narrativeDrafted
              ? 'Narrative (drafted by the assistant)'
              : 'Narrative'
            : 'Narrative (not yet drafted)'}
        </div>
        <p>
          {settings.narrative ??
            `${version.dealName}: ${formatInteger(p.totalUnits)} rental units over ${formatInteger(p.gsfTotal)} gross SF. Across the three scenarios the project IRR ranges ${range((o) => o.metrics.projectIrr, formatIrr)} and the yield on cost ${range((o) => o.metrics.yieldOnCost, formatPct)}, on a total project cost of ${formatUsd(outputs.worst.totals.tpc)} to ${formatUsd(outputs.best.totals.tpc)}. Every assumption, its source and its benchmark are listed in the assumptions register.`}
        </p>
      </div>
      {settings.coverNote ? <div className="cover-note">{settings.coverNote}</div> : null}
      <h3>Annual net operating income and debt service (Likely)</h3>
      <NoiDebtServiceChart annual={likely.annual} />
      {version.reviewedBy ? (
        <p className="reviewed">{`Reviewed by ${version.reviewedBy}`}</p>
      ) : null}
      {version.preparedBy ? (
        <p className="reviewed">{`Prepared by ${version.preparedBy}`}</p>
      ) : null}
    </>
  );
}
