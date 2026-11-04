/** Annual aggregation: twelve-month periods from month 0 (14.3); the final period may be partial. */
import type { AnnualRow, MonthRow, OpexLine } from './types';
import { OPEX_LINES } from './types';

export function buildAnnual(months: MonthRow[]): AnnualRow[] {
  const rows: AnnualRow[] = [];
  let cumulativeContributions = 0;
  for (let start = 0; start < months.length; start += 12) {
    const slice = months.slice(start, start + 12);
    const opex = {} as Record<OpexLine, number>;
    for (const l of OPEX_LINES) opex[l] = 0;
    const row: AnnualRow = {
      year: start / 12 + 1,
      fromMonth: start,
      toMonth: start + slice.length - 1,
      partial: slice.length < 12,
      gpr: 0,
      vacancyAndCreditLoss: 0,
      otherIncome: 0,
      commercialIncome: 0,
      egi: 0,
      opex,
      opexTotal: 0,
      noi: 0,
      debtService: { interest: 0, principal: 0, total: 0 },
      cashFlow: 0,
      dscr: null,
      cashOnCash: null,
      contributions: { gp: 0, lp: 0 },
      distributions: { gp: 0, lp: 0 },
    };
    for (const m of slice) {
      row.gpr += m.gpr;
      row.vacancyAndCreditLoss += m.vacancyAndCreditLoss;
      row.otherIncome += m.otherIncome;
      row.commercialIncome += m.commercialIncome;
      row.egi += m.egi;
      for (const l of OPEX_LINES) opex[l] += m.opex[l];
      row.opexTotal += m.opexTotal;
      row.noi += m.noi;
      row.debtService.interest += m.debtService.interest;
      row.debtService.principal += m.debtService.principal;
      row.contributions.gp += m.contributions.gp;
      row.contributions.lp += m.contributions.lp;
      row.distributions.gp += m.distributions.gp;
      row.distributions.lp += m.distributions.lp;
    }
    row.debtService.total = row.debtService.interest + row.debtService.principal;
    row.cashFlow = row.noi - row.debtService.total;
    row.dscr = row.debtService.total > 0 ? row.noi / row.debtService.total : null;
    cumulativeContributions += row.contributions.gp + row.contributions.lp;
    const operating = slice.some(
      (m) => m.noi !== 0 || m.debtService.interest !== 0 || m.debtService.principal !== 0,
    );
    row.cashOnCash =
      operating && cumulativeContributions > 0 ? row.cashFlow / cumulativeContributions : null;
    rows.push(row);
  }
  return rows;
}
