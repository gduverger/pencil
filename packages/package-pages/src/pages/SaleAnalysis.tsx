import { formatIrr, formatMultiple, formatPct, formatUsd } from '../format';
import type { PackageProps } from '../types';

export function SaleAnalysisPage({ props }: { props: PackageProps }) {
  const o = props.outputs[props.settings.scenario];
  const s = o.sale;
  const saleMonth = o.months[o.timeline.S]!;
  const saleDist = saleMonth.distributions;
  return (
    <>
      <div className="cols">
        <div>
          <table className="t">
            <thead>
              <tr>
                <th>Sale at month {o.timeline.S}</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="label">Forward 12-month NOI</td>
                <td className="num">{formatUsd(s.noiForward)}</td>
              </tr>
              <tr>
                <td className="label">Exit cap rate</td>
                <td className="num">{formatPct(s.capRate)}</td>
              </tr>
              <tr className="subtotal">
                <td>Gross sale value</td>
                <td className="num">{formatUsd(s.value)}</td>
              </tr>
              <tr>
                <td className="label">Selling costs</td>
                <td className="num">{formatUsd(-s.sellingCosts)}</td>
              </tr>
              <tr>
                <td className="label">Debt payoff</td>
                <td className="num">{formatUsd(-s.payoff)}</td>
              </tr>
              <tr className="total">
                <td>Net to equity</td>
                <td className="num">{formatUsd(s.netToEquity)}</td>
              </tr>
            </tbody>
          </table>
          {o.refinance ? (
            <>
              <h3>Refinance at month {o.refinance.month}</h3>
              <table className="t compact">
                <tbody>
                  <tr>
                    <td className="label">NOI (12 months from refinance)</td>
                    <td className="num">{formatUsd(o.refinance.noi12)}</td>
                  </tr>
                  <tr>
                    <td className="label">Value at refinance cap rate</td>
                    <td className="num">{formatUsd(o.refinance.value)}</td>
                  </tr>
                  <tr>
                    <td className="label">Loan at maximum LTV</td>
                    <td className="num">{formatUsd(o.refinance.loanLTV)}</td>
                  </tr>
                  <tr>
                    <td className="label">Loan at minimum DSCR</td>
                    <td className="num">{formatUsd(o.refinance.loanDSCR)}</td>
                  </tr>
                  <tr className="subtotal">
                    <td>Permanent loan</td>
                    <td className="num">{formatUsd(o.refinance.loan)}</td>
                  </tr>
                  <tr>
                    <td className="label">Fee and payoff of construction debt</td>
                    <td className="num">{formatUsd(-(o.refinance.fee + o.refinance.constructionPayoff + o.refinance.mezzPayoff))}</td>
                  </tr>
                  <tr className="total">
                    <td>{o.refinance.net >= 0 ? 'Net proceeds to equity' : 'Shortfall funded by equity'}</td>
                    <td className="num">{formatUsd(o.refinance.net)}</td>
                  </tr>
                </tbody>
              </table>
            </>
          ) : null}
        </div>
        <div>
          <table className="t">
            <thead>
              <tr>
                <th>Waterfall at sale, by tier</th>
                <th className="num">Total</th>
                <th className="num">LP</th>
                <th className="num">GP</th>
              </tr>
            </thead>
            <tbody>
              {o.waterfall.tiers.map((t) => (
                <tr key={t.index}>
                  <td className="label">{`Tier ${t.index + 1}: ${t.hurdleIrrPct === null ? 'residual' : `to ${formatPct(t.hurdleIrrPct)} IRR`} (${Math.round(t.lpSplit * 100)}/${Math.round(t.gpSplit * 100)})`}</td>
                  <td className="num">{formatUsd(t.atSale.total)}</td>
                  <td className="num">{formatUsd(t.atSale.lp)}</td>
                  <td className="num">{formatUsd(t.atSale.gp)}</td>
                </tr>
              ))}
              <tr className="total">
                <td>Sale distribution</td>
                <td className="num">{formatUsd(saleDist.gp + saleDist.lp)}</td>
                <td className="num">{formatUsd(saleDist.lp)}</td>
                <td className="num">{formatUsd(saleDist.gp)}</td>
              </tr>
            </tbody>
          </table>
          <h3>Whole hold, by partner</h3>
          <table className="t compact">
            <thead>
              <tr>
                <th />
                <th className="num">LP</th>
                <th className="num">GP</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="label">Contributions</td>
                <td className="num">{formatUsd(o.waterfall.byPartner.lp.contributions)}</td>
                <td className="num">{formatUsd(o.waterfall.byPartner.gp.contributions)}</td>
              </tr>
              <tr>
                <td className="label">Distributions</td>
                <td className="num">{formatUsd(o.waterfall.byPartner.lp.distributions)}</td>
                <td className="num">{formatUsd(o.waterfall.byPartner.gp.distributions)}</td>
              </tr>
              <tr>
                <td className="label">Profit</td>
                <td className="num">{formatUsd(o.waterfall.byPartner.lp.profit)}</td>
                <td className="num">{formatUsd(o.waterfall.byPartner.gp.profit)}</td>
              </tr>
              <tr>
                <td className="label">IRR</td>
                <td className="num">{formatIrr(o.waterfall.byPartner.lp.irr)}</td>
                <td className="num">{formatIrr(o.waterfall.byPartner.gp.irr)}</td>
              </tr>
              <tr>
                <td className="label">Multiple</td>
                <td className="num">{formatMultiple(o.waterfall.byPartner.lp.multiple)}</td>
                <td className="num">{formatMultiple(o.waterfall.byPartner.gp.multiple)}</td>
              </tr>
            </tbody>
          </table>
          <h3>By tier, whole hold</h3>
          <table className="t compact">
            <tbody>
              {o.waterfall.tiers.map((t) => (
                <tr key={t.index}>
                  <td className="label">{`Tier ${t.index + 1}`}</td>
                  <td className="num">{formatUsd(t.total)}</td>
                  <td className="num">{formatUsd(t.lp)}</td>
                  <td className="num">{formatUsd(t.gp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="footnote">Figures rounded; totals may not foot.</p>
    </>
  );
}
