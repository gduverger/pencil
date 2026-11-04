import { formatUsd, formatUsdPerSF, formatUsdWhole } from '../format';
import type { PackageProps } from '../types';
import { lineRows } from './SourcesUses';

export function CapitalBudgetPage({ props }: { props: PackageProps }) {
  const o = props.outputs[props.settings.scenario];
  return (
    <>
      <table className="t">
        <thead>
          <tr>
            <th>Line</th>
            <th className="num">Amount</th>
            <th className="num">Per unit</th>
            <th className="num">Per GSF</th>
          </tr>
        </thead>
        <tbody>
          {o.capitalBudget.map((g) => (
            <GroupRows key={g.key} g={g} />
          ))}
          <tr className="total">
            <td>Total project cost</td>
            <td className="num">{formatUsd(o.totals.tpc)}</td>
            <td className="num">{formatUsdWhole(o.metrics.costPerUnit)}</td>
            <td className="num">{formatUsdPerSF(o.metrics.costPerGSF)}</td>
          </tr>
        </tbody>
      </table>
      <p className="footnote">
        Figures rounded; totals may not foot. Children are shown at the depth the deal was
        elaborated to.
      </p>
    </>
  );
}

function GroupRows({ g }: { g: PackageProps['outputs']['likely']['capitalBudget'][number] }) {
  return (
    <>
      <tr className="group">
        <td colSpan={4}>{g.label}</td>
      </tr>
      {lineRows(g.lines, 1)}
      <tr className="subtotal">
        <td className="indent-1">{`Subtotal — ${g.label}`}</td>
        <td className="num">{formatUsd(g.subtotal)}</td>
        <td className="num">{formatUsdWhole(g.perUnit)}</td>
        <td className="num">{formatUsdPerSF(g.perGSF)}</td>
      </tr>
    </>
  );
}
