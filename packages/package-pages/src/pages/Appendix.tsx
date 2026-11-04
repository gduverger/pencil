import type { AmortRow } from '@pencil/engine';
import { formatUsd, monthLabel } from '../format';
import type { PackageProps } from '../types';

function amortByYear(
  rows: AmortRow[],
): Array<{ year: number; payment: number; interest: number; principal: number; ending: number }> {
  const out: Array<{
    year: number;
    payment: number;
    interest: number;
    principal: number;
    ending: number;
  }> = [];
  for (let i = 0; i < rows.length; i += 12) {
    const slice = rows.slice(i, i + 12);
    out.push({
      year: i / 12 + 1,
      payment: slice.reduce((s, r) => s + r.payment, 0),
      interest: slice.reduce((s, r) => s + r.interest, 0),
      principal: slice.reduce((s, r) => s + r.principal, 0),
      ending: slice[slice.length - 1]!.endingBalance,
    });
  }
  return out;
}

export function AppendixPage({ props }: { props: PackageProps }) {
  const o = props.outputs[props.settings.scenario];
  const years = amortByYear(o.amortization);
  const holdYears = Math.ceil((o.timeline.S - o.timeline.R) / 12);
  return (
    <>
      <div className="cols">
        <div style={{ flex: '0 0 4.6in' }}>
          <h3 style={{ marginTop: 0 }}>Permanent loan amortization by year</h3>
          {o.refinance ? (
            <table className="t compact">
              <thead>
                <tr>
                  <th>Loan year</th>
                  <th className="num">Payments</th>
                  <th className="num">Interest</th>
                  <th className="num">Principal</th>
                  <th className="num">Ending balance</th>
                </tr>
              </thead>
              <tbody>
                {years.slice(0, Math.max(holdYears, 1) + 1).map((y) => (
                  <tr key={y.year} className={y.year === holdYears ? 'subtotal' : ''}>
                    <td>{`${y.year}${y.year === holdYears ? ' (sale)' : ''}`}</td>
                    <td className="num">{formatUsd(y.payment)}</td>
                    <td className="num">{formatUsd(y.interest)}</td>
                    <td className="num">{formatUsd(y.principal)}</td>
                    <td className="num">{formatUsd(y.ending)}</td>
                  </tr>
                ))}
                {years.length > holdYears + 1 ? (
                  <tr>
                    <td
                      className="muted"
                      colSpan={5}
                    >{`… ${years.length - holdYears - 1} more years to maturity (loan of ${formatUsd(o.refinance.loan)} at ${(o.inputs.financing.permanent.ratePct * 100).toFixed(2)}% over ${o.inputs.financing.permanent.amortYears} years${o.inputs.financing.permanent.ioMonths > 0 ? `, ${o.inputs.financing.permanent.ioMonths} months interest-only` : ''}).`}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          ) : (
            <p className="small">
              No permanent loan: the construction loan stays outstanding, interest-only, until the
              sale.
            </p>
          )}
        </div>
        <div>
          <h3 style={{ marginTop: 0 }}>Methodology</h3>
          <ul className="methodology">
            <li>{`Computed by the Pencil engine version ${props.version.engineVersion}, a deterministic monthly model: every number on these pages comes from the same calculation on the inputs in the assumptions register.`}</li>
            <li>{`Timeline: predevelopment ${o.timeline.P} months, construction ${o.timeline.O - o.timeline.P} months, lease-up ${o.timeline.Z - o.timeline.O} months; ${o.timeline.permanentEnabled ? `refinance at month ${o.timeline.R}` : 'no permanent refinance'}; sale at month ${o.timeline.S}.`}</li>
            <li>
              Costs are funded in order: equity, then mezzanine where used, then the construction
              loan; interest is capitalized monthly and total project cost is solved as a fixed
              point.
            </li>
            <li>
              Rents and expenses grow in annual steps from the analysis month; income begins at
              completion; lease-up deficits are project costs when capitalized.
            </li>
            <li>
              Sale value capitalizes the twelve months of NOI after the sale month at the exit cap
              rate, less selling costs and debt payoff; proceeds flow through the tiered waterfall
              with IRR hurdles.
            </li>
            <li>
              Figures are rounded for presentation only (dollars to the nearest thousand above
              $100,000, otherwise the nearest hundred; per-SF figures to cents); parts and totals
              are rounded independently.
            </li>
          </ul>
          <p className="small">{`Version ${props.version.versionNumber} created ${props.version.versionDate}; fixed point converged in ${o.diagnostics.iterations} iterations.`}</p>
        </div>
      </div>
      {props.settings.includeMonthlyAppendix ? <MonthlySchedule props={props} /> : null}
    </>
  );
}

function MonthlySchedule({ props }: { props: PackageProps }) {
  const o = props.outputs[props.settings.scenario];
  return (
    <>
      <h3>Monthly schedule</h3>
      <table className="t dense">
        <thead>
          <tr>
            <th>Month</th>
            <th>Phase</th>
            <th className="num">Costs</th>
            <th className="num">Equity in</th>
            <th className="num">Loan draw</th>
            <th className="num">Interest</th>
            <th className="num">Loan balance</th>
            <th className="num">NOI</th>
            <th className="num">Debt service</th>
            <th className="num">Perm balance</th>
            <th className="num">Cash flow</th>
            <th className="num">Dist. LP</th>
            <th className="num">Dist. GP</th>
          </tr>
        </thead>
        <tbody>
          {o.months.map((m) => (
            <tr key={m.t}>
              <td>{`${m.t} · ${monthLabel(o.timeline.analysisMonth, m.t)}`}</td>
              <td>{m.phase}</td>
              <td className="num">{formatUsd(m.costTotal)}</td>
              <td className="num">{formatUsd(m.contributions.gp + m.contributions.lp)}</td>
              <td className="num">{formatUsd(m.loanDraw + m.mezzDraw + m.landLoanDraw)}</td>
              <td className="num">{formatUsd(m.interest)}</td>
              <td className="num">
                {formatUsd(m.loanBalance + m.mezzBalance + m.landLoanBalance)}
              </td>
              <td className="num">{formatUsd(m.noi)}</td>
              <td className="num">{formatUsd(m.debtService.interest + m.debtService.principal)}</td>
              <td className="num">{formatUsd(m.permBalance)}</td>
              <td className="num">{formatUsd(m.cashFlowAfterDebt)}</td>
              <td className="num">{formatUsd(m.distributions.lp)}</td>
              <td className="num">{formatUsd(m.distributions.gp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
