import type { ReactElement } from 'react';
import type { Line } from '@pencil/engine';
import { SourcesDonut } from '../charts';
import { formatUsd, formatUsdPerSF, formatUsdWhole } from '../format';
import type { PackageProps } from '../types';

export function lineRows(lines: Line[], depth = 0): ReactElement[] {
  const rows: ReactElement[] = [];
  for (const l of lines) {
    rows.push(
      <tr key={`${depth}-${l.key}`}>
        <td className={depth > 0 ? `indent-${Math.min(depth, 3)}` : ''}>{l.label}</td>
        <td className="num">{formatUsd(l.amount)}</td>
        <td className="num">{formatUsdWhole(l.perUnit)}</td>
        <td className="num">{formatUsdPerSF(l.perGSF)}</td>
      </tr>,
    );
    if (l.children) rows.push(...lineRows(l.children, depth + 1));
  }
  return rows;
}

export function SourcesUsesPage({ props }: { props: PackageProps }) {
  const o = props.outputs[props.settings.scenario];
  const su = o.sourcesUses;
  const head = (first: string) => (
    <thead>
      <tr>
        <th>{first}</th>
        <th className="num">Amount</th>
        <th className="num">Per unit</th>
        <th className="num">Per GSF</th>
      </tr>
    </thead>
  );
  return (
    <>
      <div className="cols">
        <div>
          <table className="t">
            {head('Sources')}
            <tbody>
              {lineRows(su.sources)}
              <tr className="total">
                <td>Total sources</td>
                <td className="num">{formatUsd(su.totalSources)}</td>
                <td className="num">{formatUsdWhole(su.totalSources / o.program.totalUnits)}</td>
                <td className="num">{formatUsdPerSF(su.totalSources / o.program.gsfTotal)}</td>
              </tr>
              {su.memo.map((m) => (
                <tr key={m.key}>
                  <td className="muted">{m.label}</td>
                  <td className="num muted">{formatUsd(m.amount)}</td>
                  <td className="num muted">{formatUsdWhole(m.perUnit)}</td>
                  <td className="num muted">{formatUsdPerSF(m.perGSF)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          <table className="t">
            {head('Uses')}
            <tbody>
              {lineRows(su.uses)}
              <tr className="total">
                <td>Total uses</td>
                <td className="num">{formatUsd(su.totalUses)}</td>
                <td className="num">{formatUsdWhole(su.totalUses / o.program.totalUnits)}</td>
                <td className="num">{formatUsdPerSF(su.totalUses / o.program.gsfTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p className="footnote">
        Figures rounded; totals may not foot. Sources and uses balance to the dollar before
        rounding.
      </p>
      <h3>Sources of funds</h3>
      <SourcesDonut sources={su.sources} />
    </>
  );
}
