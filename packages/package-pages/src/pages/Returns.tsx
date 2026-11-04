import type { DealOutputs, ScenarioKey } from '@pencil/engine';
import { EquityBars } from '../charts';
import { formatIrr, formatMultiple, formatPct, formatUsd, formatUsdPerSF, formatUsdWhole } from '../format';
import type { PackageProps } from '../types';

const KEYS: ScenarioKey[] = ['likely', 'best', 'worst'];

export function ReturnsPage({ props }: { props: PackageProps }) {
  const { outputs } = props;
  const row = (label: string, f: (o: DealOutputs) => string, cls = '') => (
    <tr key={label} className={cls}>
      <td className="label">{label}</td>
      {KEYS.map((k) => (
        <td key={k} className="num">
          {f(outputs[k])}
        </td>
      ))}
    </tr>
  );
  const group = (label: string) => (
    <tr key={`g-${label}`} className="group">
      <td colSpan={4}>{label}</td>
    </tr>
  );
  const likely = outputs.likely;
  const years = likely.annual.filter((a) => a.dscr !== null || a.cashOnCash !== null);
  const flags = KEYS.map((k) => outputs[k].flags.length);
  return (
    <>
      <div className="cols">
        <div style={{ flex: '1 1 60%' }}>
          <table className="t">
            <thead>
              <tr>
                <th>Metric</th>
                <th className="num">Likely</th>
                <th className="num">Best</th>
                <th className="num">Worst</th>
              </tr>
            </thead>
            <tbody>
              {group('Project')}
              {row('Unlevered IRR', (o) => formatIrr(o.metrics.unleveredIrr))}
              {row('Project (levered) IRR', (o) => formatIrr(o.metrics.projectIrr))}
              {row('Equity multiple', (o) => formatMultiple(o.metrics.equityMultiple))}
              {row('Profit', (o) => formatUsd(o.metrics.profit))}
              {row('Peak equity', (o) => formatUsd(o.metrics.peakEquity))}
              {row('Total equity contributed', (o) => formatUsd(o.metrics.totalEquity))}
              {row('Yield on cost', (o) => formatPct(o.metrics.yieldOnCost))}
              {row('Development spread', (o) => formatPct(o.metrics.developmentSpread))}
              {row('Stabilized NOI', (o) => formatUsd(o.metrics.stabilizedNoi))}
              {row('Total project cost', (o) => formatUsd(o.metrics.totalProjectCost))}
              {row('Cost per unit', (o) => formatUsdWhole(o.metrics.costPerUnit))}
              {row('Cost per gross SF', (o) => formatUsdPerSF(o.metrics.costPerGSF))}
              {row('Construction loan', (o) => formatUsd(o.metrics.constructionLoan))}
              {row('Capitalized interest', (o) => formatUsd(o.metrics.capitalizedInterest))}
              {row('Permanent loan', (o) => formatUsd(o.metrics.permanentLoan))}
              {row('Sale value', (o) => formatUsd(o.metrics.saleValue))}
              {row('Net to equity at sale', (o) => formatUsd(o.metrics.netToEquityAtSale))}
              {group('LP')}
              {row('LP IRR', (o) => formatIrr(o.metrics.lpIrr))}
              {row('LP multiple', (o) => formatMultiple(o.metrics.lpMultiple))}
              {row('LP contributions', (o) => formatUsd(o.waterfall.byPartner.lp.contributions))}
              {row('LP distributions', (o) => formatUsd(o.waterfall.byPartner.lp.distributions))}
              {group('GP')}
              {row('GP IRR', (o) => formatIrr(o.metrics.gpIrr))}
              {row('GP multiple', (o) => formatMultiple(o.metrics.gpMultiple))}
              {row('GP contributions', (o) => formatUsd(o.waterfall.byPartner.gp.contributions))}
              {row('GP distributions', (o) => formatUsd(o.waterfall.byPartner.gp.distributions))}
              {group('Checks')}
              {row('Flags', (o) => String(o.flags.length))}
            </tbody>
          </table>
          <p className="footnote">Figures rounded; totals may not foot.</p>
        </div>
        <div style={{ flex: '1 1 40%' }}>
          <h3 style={{ marginTop: 0 }}>Peak equity vs total equity (Likely)</h3>
          <EquityBars peak={likely.metrics.peakEquity ?? 0} total={likely.metrics.totalEquity ?? 0} />
          <h3>DSCR and cash-on-cash by year (Likely)</h3>
          <table className="t compact">
            <thead>
              <tr>
                <th>Year</th>
                <th className="num">NOI</th>
                <th className="num">Debt service</th>
                <th className="num">DSCR</th>
                <th className="num">Cash-on-cash</th>
              </tr>
            </thead>
            <tbody>
              {years.map((y) => (
                <tr key={y.year}>
                  <td>{`${y.year}${y.partial ? '*' : ''}`}</td>
                  <td className="num">{formatUsd(y.noi)}</td>
                  <td className="num">{formatUsd(y.debtService.total)}</td>
                  <td className="num">{y.dscr === null ? '—' : `${y.dscr.toFixed(2)}x`}</td>
                  <td className="num">{formatPct(y.cashOnCash)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="footnote">{`* partial year (sale period). Flags: ${flags[0]} likely, ${flags[1]} best, ${flags[2]} worst.`}</p>
          {likely.flags.length > 0 ? (
            <ul className="small" style={{ paddingLeft: 16, margin: '6px 0' }}>
              {likely.flags.slice(0, 6).map((f, i) => (
                <li key={i} className="flag">
                  {f.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </>
  );
}
