/** Permanent loan sizing (7.8) and the reusable amortization schedule. */
import { annuityFactor, levelPayment } from './math';
import type { AmortRow } from './types';

/**
 * amortize(principal, ratePct, amortYears, ioMonths): `ioMonths` interest-only rows followed by
 * 12 × amortYears level-payment rows with the standard principal/interest split. The final
 * balance is zero (to floating-point precision).
 */
export function amortize(
  principal: number,
  ratePct: number,
  amortYears: number,
  ioMonths: number,
): AmortRow[] {
  const rows: AmortRow[] = [];
  if (!(principal > 0)) return rows;
  const i = ratePct / 12;
  const n = Math.round(12 * amortYears);
  let balance = principal;
  let period = 0;
  for (let k = 0; k < ioMonths; k++) {
    period += 1;
    const interest = balance * i;
    rows.push({
      period,
      beginningBalance: balance,
      payment: interest,
      interest,
      principal: 0,
      endingBalance: balance,
      interestOnly: true,
    });
  }
  const payment = levelPayment(principal, i, n);
  for (let k = 0; k < n; k++) {
    period += 1;
    const interest = balance * i;
    let principalPaid = payment - interest;
    if (k === n - 1) principalPaid = balance; // absorb floating-point residue in the last row
    const ending = balance - principalPaid;
    rows.push({
      period,
      beginningBalance: balance,
      payment: interest + principalPaid,
      interest,
      principal: principalPaid,
      endingBalance: k === n - 1 ? 0 : ending,
      interestOnly: false,
    });
    balance = k === n - 1 ? 0 : ending;
  }
  return rows;
}

export interface PermanentSizing {
  noi12: number;
  value: number;
  loanLTV: number;
  loanDSCR: number;
  loan: number;
  fee: number;
}

/**
 * L_LTV = maxLTV × V_R with V_R = NOI12 / refiCapRatePct;
 * L_DSCR = NOI12 / (DSCR_min × 12) × (1 − (1 + i)^−n) / i, i = r_p / 12, n = 12 × amortYears;
 * L = min(L_LTV, L_DSCR), floored at zero when forward NOI is not positive.
 */
export function sizePermanentLoan(
  noi12: number,
  p: {
    refiCapRatePct: number;
    maxLTV: number;
    minDSCR: number;
    ratePct: number;
    amortYears: number;
    feePct: number;
  },
): PermanentSizing {
  const value = noi12 / p.refiCapRatePct;
  const loanLTV = p.maxLTV * value;
  const i = p.ratePct / 12;
  const n = Math.round(12 * p.amortYears);
  const loanDSCR = (noi12 / (p.minDSCR * 12)) * annuityFactor(i, n);
  const loan = Math.max(0, Math.min(loanLTV, loanDSCR));
  return { noi12, value, loanLTV, loanDSCR, loan, fee: loan * p.feePct };
}
