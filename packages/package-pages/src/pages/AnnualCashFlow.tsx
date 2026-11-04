import type { AnnualRow } from '@pencil/engine';
import { OPEX_LINES } from '@pencil/engine';
import { formatPct, formatUsd } from '../format';
import type { PackageProps } from '../types';

const OPEX_LABELS: Record<(typeof OPEX_LINES)[number], string> = {
  taxes: 'Property taxes',
  insurance: 'Insurance',
  repairs: 'Repairs and maintenance',
  payroll: 'Payroll',
  utilities: 'Utilities',
  admin: 'Administrative',
  marketing: 'Marketing',
  reserves: 'Replacement reserves',
  management: 'Management',
  commercial: 'Commercial opex',
};

export function AnnualCashFlowPage({ props }: { props: PackageProps }) {
  const o = props.outputs[props.settings.scenario];
  const years = o.annual;
  const dense = years.length > 12;
  const row = (label: string, f: (y: AnnualRow) => string, cls = '') => (
    <tr key={label} className={cls}>
      <td className={cls === 'subtotal' || cls === 'total' ? '' : 'label'}>{label}</td>
      {years.map((y) => (
        <td key={y.year} className="num">
          {f(y)}
        </td>
      ))}
    </tr>
  );
  const commercialOn = o.inputs.program.commercial.enabled;
  return (
    <>
      <table className={`t ${dense ? 'dense' : 'compact'}`}>
        <thead>
          <tr>
            <th />
            {years.map((y) => (
              <th key={y.year} className="num">
                {`Year ${y.year}${y.partial ? '*' : ''}`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {row('Gross potential rent', (y) => formatUsd(y.gpr))}
          {row('Vacancy and credit loss', (y) => formatUsd(-y.vacancyAndCreditLoss))}
          {row('Other income', (y) => formatUsd(y.otherIncome))}
          {commercialOn ? row('Commercial income', (y) => formatUsd(y.commercialIncome)) : null}
          {row('Effective gross income', (y) => formatUsd(y.egi), 'subtotal')}
          {OPEX_LINES.filter((l) => l !== 'commercial' || commercialOn).map((l) => row(OPEX_LABELS[l], (y) => formatUsd(-y.opex[l])))}
          {row('Total operating expenses', (y) => formatUsd(-y.opexTotal), 'subtotal')}
          {row('Net operating income', (y) => formatUsd(y.noi), 'total')}
          {row('Debt service — interest', (y) => formatUsd(-y.debtService.interest))}
          {row('Debt service — principal', (y) => formatUsd(-y.debtService.principal))}
          {row('Cash flow after debt service', (y) => formatUsd(y.cashFlow), 'subtotal')}
          {row('DSCR', (y) => (y.dscr === null ? '—' : `${y.dscr.toFixed(2)}x`))}
          {row('Cash-on-cash', (y) => formatPct(y.cashOnCash))}
          {row('Distributions to LP', (y) => formatUsd(y.distributions.lp))}
          {row('Distributions to GP', (y) => formatUsd(y.distributions.gp))}
          {row('Contributions (all partners)', (y) => formatUsd(-(y.contributions.gp + y.contributions.lp)))}
        </tbody>
      </table>
      <p className="footnote">{`Figures rounded; totals may not foot. Years are twelve-month periods from the analysis month (${o.timeline.analysisMonth}); * marks the partial sale period. Operations begin at month ${o.timeline.O}; stabilization at month ${o.timeline.Z}.`}</p>
    </>
  );
}
