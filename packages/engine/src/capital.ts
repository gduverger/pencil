/**
 * The operating regime after the development period: refinance at R (7.8), debt service, monthly
 * cash flow after debt, and the sale at S (7.9). Produces the pre-waterfall flows per month.
 */
import type { FundingResult } from './funding';
import type { OperationsSeries } from './operations';
import { amortize, sizePermanentLoan } from './permanent';
import { sumRange, zeros } from './math';
import type { DealInputs } from './schema';
import type { Timeline } from './timeline';
import type { AmortRow, RefinanceResult, SaleResult } from './types';

export interface CapitalResult {
  refinance: RefinanceResult | null;
  amortization: AmortRow[];
  sale: SaleResult;
  permanentLoan: number;
  debtServiceInterest: number[];
  debtServicePrincipal: number[];
  permBalance: number[];
  loanBalance: number[];
  mezzBalance: number[];
  /** Net refinance proceeds (+) or shortfall (−) placed at R; surplus carried to R is included. */
  refinanceFlow: number[];
  saleFlow: number[];
  /** NOI − debt service + inflow events, for t ≥ R; zero before. */
  operatingFlow: number[];
  /** Total pre-waterfall flow: operating + refinance + sale. Positive → distribution, negative → pro rata contribution. */
  flow: number[];
  mezzRepaidAt: 'refi' | 'sale' | null;
}

export function computeCapital(inputs: DealInputs, tl: Timeline, ops: OperationsSeries, funding: FundingResult): CapitalResult {
  const n = tl.S + 1;
  const fin = inputs.financing;
  const perm = fin.permanent;
  const permOn = perm.enabled;
  const B_R = funding.loanBalanceAtR;
  const MB_R = funding.mezzBalanceAtR;
  const mezzOutstanding = fin.mezz.enabled && MB_R > 0;
  const mezzRepaidAt: 'refi' | 'sale' | null = !mezzOutstanding ? null : permOn && fin.mezz.repaidAt === 'refi' ? 'refi' : 'sale';

  const debtServiceInterest = zeros(n);
  const debtServicePrincipal = zeros(n);
  const permBalance = zeros(n);
  const loanBalance = funding.months.map((m) => m.loanBalance);
  const mezzBalance = funding.months.map((m) => m.mezzBalance);
  const refinanceFlow = zeros(n);
  const saleFlow = zeros(n);
  const operatingFlow = zeros(n);
  const flow = zeros(n);

  // Refinance at R.
  let refinance: RefinanceResult | null = null;
  let amortization: AmortRow[] = [];
  let permanentLoan = 0;
  if (permOn) {
    const noi12 = sumRange(ops.noi, tl.R, tl.R + 11);
    const sizing = sizePermanentLoan(noi12, perm);
    permanentLoan = sizing.loan;
    const constructionPayoff = B_R;
    const mezzPayoff = mezzRepaidAt === 'refi' ? MB_R : 0;
    const net = sizing.loan - sizing.fee - constructionPayoff - mezzPayoff;
    refinance = {
      month: tl.R,
      noi12,
      capRate: perm.refiCapRatePct,
      value: sizing.value,
      loanLTV: sizing.loanLTV,
      loanDSCR: sizing.loanDSCR,
      loan: sizing.loan,
      fee: sizing.fee,
      constructionPayoff,
      mezzPayoff,
      net,
    };
    amortization = amortize(sizing.loan, perm.ratePct, perm.amortYears, perm.ioMonths);
    refinanceFlow[tl.R] = net + funding.surplusAtR;
    // The construction loan is repaid at R; the balance shows through R and is zero after.
    for (let t = tl.R + 1; t < n; t++) loanBalance[t] = 0;
    if (mezzRepaidAt === 'refi') for (let t = tl.R + 1; t < n; t++) mezzBalance[t] = 0;
    permBalance[tl.R] = sizing.loan;
    for (let t = tl.R + 1; t < n; t++) {
      const row = amortization[t - tl.R - 1];
      if (row) {
        debtServiceInterest[t]! += row.interest;
        debtServicePrincipal[t]! += row.principal;
        permBalance[t] = row.endingBalance;
      } else {
        permBalance[t] = 0;
      }
    }
  } else {
    // No permanent loan: the construction loan stays outstanding, interest-only, until the sale.
    refinanceFlow[tl.R] = funding.surplusAtR;
    const rc = fin.constructionLoan.ratePct / 12;
    for (let t = tl.R + 1; t < n; t++) {
      debtServiceInterest[t]! += B_R * rc;
      loanBalance[t] = B_R;
    }
  }

  // Mezzanine outstanding after R: interest-only from cash flow until the sale.
  if (mezzRepaidAt === 'sale') {
    const rm = fin.mezz.ratePct / 12;
    for (let t = tl.R + 1; t < n; t++) {
      debtServiceInterest[t]! += MB_R * rm;
      mezzBalance[t] = MB_R;
    }
  }

  // Sale at S.
  const noiForward = sumRange(ops.noi, tl.S + 1, tl.S + 12);
  const value = noiForward / inputs.exit.exitCapRatePct;
  const sellingCosts = (inputs.exit.brokerFeePct + inputs.exit.closingCostPct) * value;
  const loanPayoff = permOn ? (permBalance[tl.S] ?? 0) : B_R;
  const mezzPayoff = mezzRepaidAt === 'sale' ? MB_R : 0;
  const netToEquity = value - sellingCosts - loanPayoff - mezzPayoff;
  const sale: SaleResult = {
    month: tl.S,
    noiForward,
    capRate: inputs.exit.exitCapRatePct,
    value,
    sellingCosts,
    loanPayoff,
    mezzPayoff,
    payoff: loanPayoff + mezzPayoff,
    netToEquity,
  };
  saleFlow[tl.S] = netToEquity;

  // Operating cash flow after debt from R on (NOI at R has no debt service: the first payment is at R + 1).
  for (let t = tl.R; t < n; t++) {
    const inflows = t > tl.R ? (funding.months[t]?.inflows ?? 0) : 0;
    operatingFlow[t] = (ops.noi[t] ?? 0) - debtServiceInterest[t]! - debtServicePrincipal[t]! + inflows;
  }
  for (let t = 0; t < n; t++) flow[t] = operatingFlow[t]! + refinanceFlow[t]! + saleFlow[t]!;

  return {
    refinance,
    amortization,
    sale,
    permanentLoan,
    debtServiceInterest,
    debtServicePrincipal,
    permBalance,
    loanBalance,
    mezzBalance,
    refinanceFlow,
    saleFlow,
    operatingFlow,
    flow,
    mezzRepaidAt,
  };
}
