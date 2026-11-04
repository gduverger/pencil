/**
 * Output types (spec 7.15). Every number is full precision; rounding is presentation-only.
 */
import type { DealInputs, UnitTypeKey } from './schema';

export type Phase = 'predevelopment' | 'construction' | 'leaseUp' | 'stabilized' | 'sale';

export const COST_CATEGORIES = [
  'land',
  'closing',
  'hard',
  'hardContingency',
  'soft',
  'softContingency',
  'carryTaxes',
  'carryInsurance',
  'developerFee',
  'commercialTI',
  'events',
  'financingFees',
  'capitalizedInterest',
  'operatingDeficit',
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export const OPEX_LINES = [
  'taxes',
  'insurance',
  'repairs',
  'payroll',
  'utilities',
  'admin',
  'marketing',
  'reserves',
  'management',
  'commercial',
] as const;
export type OpexLine = (typeof OPEX_LINES)[number];

export const METRIC_KEYS = [
  'unleveredIrr',
  'projectIrr',
  'lpIrr',
  'gpIrr',
  'equityMultiple',
  'lpMultiple',
  'gpMultiple',
  'yieldOnCost',
  'developmentSpread',
  'peakEquity',
  'profit',
  'totalProjectCost',
  'costPerUnit',
  'costPerGSF',
  'totalEquity',
  'stabilizedNoi',
  'saleValue',
  'netToEquityAtSale',
  'permanentLoan',
  'constructionLoan',
  'capitalizedInterest',
] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];

export interface MonthRow {
  t: number;
  phase: Phase;
  /** Capitalized costs this month by category (financing fees, interest and deficits included). */
  costs: Record<CostCategory, number>;
  costTotal: number;
  /** Inflow events this month. */
  inflows: number;
  /** Development-period equity calls: cash split pro rata, plus in-kind land (GP) at month 0. */
  equityIn: { gp: number; lp: number; inKind: number };
  /** Every contribution this month (equity calls, non-capitalized deficits, refinance shortfall, post-refinance deficits). */
  contributions: { gp: number; lp: number };
  mezzDraw: number;
  loanDraw: number;
  landLoanDraw: number;
  /** Capitalized interest this month, all loans. */
  interest: number;
  interestBreakdown: { construction: number; land: number; mezz: number };
  loanBalance: number;
  landLoanBalance: number;
  mezzBalance: number;
  gpr: number;
  occupancy: number;
  vacancyAndCreditLoss: number;
  otherIncome: number;
  commercialIncome: number;
  egi: number;
  opex: Record<OpexLine, number>;
  opexTotal: number;
  noi: number;
  /** Debt service paid from operating cash flow (after the refinance month). */
  debtService: { interest: number; principal: number };
  permBalance: number;
  /** Net refinance proceeds at R (positive) or shortfall (negative). */
  refinance: number;
  /** Net sale proceeds to equity at S. */
  saleProceeds: number;
  /** NOI − debt service (+ refinance net + sale proceeds + post-R inflows) in the operating regime. */
  cashFlowAfterDebt: number;
  distributions: { gp: number; lp: number; byTier: number[] };
}

export interface AnnualRow {
  year: number;
  /** First and last month index covered (inclusive). */
  fromMonth: number;
  toMonth: number;
  partial: boolean;
  gpr: number;
  vacancyAndCreditLoss: number;
  otherIncome: number;
  commercialIncome: number;
  egi: number;
  opex: Record<OpexLine, number>;
  opexTotal: number;
  noi: number;
  debtService: { interest: number; principal: number; total: number };
  cashFlow: number;
  dscr: number | null;
  cashOnCash: number | null;
  contributions: { gp: number; lp: number };
  distributions: { gp: number; lp: number };
}

export interface Line {
  key: string;
  label: string;
  amount: number;
  perUnit: number;
  perGSF: number;
  children?: Line[];
}

export interface Group {
  key: string;
  label: string;
  lines: Line[];
  subtotal: number;
  perUnit: number;
  perGSF: number;
}

export interface ProgramSummary {
  totalUnits: number;
  unitTypes: Array<{
    key: UnitTypeKey;
    mixPct: number;
    units: number;
    avgSF: number;
    rentPerMonth: number;
    nrsf: number;
    affordableUnits: number;
  }>;
  nrsf: number;
  gsf: number;
  commercialSF: number;
  gsfTotal: number;
  efficiency: number;
}

export interface TimelineSummary {
  analysisMonth: string;
  P: number;
  O: number;
  Z: number;
  R: number;
  S: number;
  /** Number of rows in `months` (S + 1). */
  monthCount: number;
  permanentEnabled: boolean;
}

export interface RefinanceResult {
  month: number;
  noi12: number;
  capRate: number;
  value: number;
  loanLTV: number;
  loanDSCR: number;
  loan: number;
  fee: number;
  constructionPayoff: number;
  mezzPayoff: number;
  net: number;
}

export interface SaleResult {
  month: number;
  noiForward: number;
  capRate: number;
  value: number;
  sellingCosts: number;
  loanPayoff: number;
  mezzPayoff: number;
  payoff: number;
  netToEquity: number;
}

export interface TierResult {
  index: number;
  hurdleIrrPct: number | null;
  lpSplit: number;
  gpSplit: number;
  total: number;
  lp: number;
  gp: number;
  /** Distribution through this tier at the sale month only. */
  atSale: { total: number; lp: number; gp: number };
}

export interface PartnerResult {
  contributions: number;
  distributions: number;
  irr: number | null;
  multiple: number | null;
  profit: number;
}

export interface AmortRow {
  /** 1-based payment number. */
  period: number;
  beginningBalance: number;
  payment: number;
  interest: number;
  principal: number;
  endingBalance: number;
  interestOnly: boolean;
}

export interface Flag {
  path?: string;
  code: string;
  message: string;
}

export interface Totals {
  tpc: number;
  byCategory: Record<CostCategory, number>;
  /** All development-period equity, cash plus in-kind. */
  equity: number;
  equityCash: number;
  equityInKind: number;
  /** Equity commitment E = TPC − Lc − M used by the funding order. */
  equityCommitment: number;
  /** Construction loan balance at the end of the development period (draws plus capitalized interest). */
  constructionLoan: number;
  constructionLoanCommitment: number;
  mezz: number;
  mezzCommitment: number;
  permanentLoan: number;
  capitalizedInterest: number;
  financingFees: number;
  operatingDeficit: number;
  inflowEvents: number;
  /** Positive NOI before the refinance month that reduced the funding requirement. */
  leaseUpNoi: number;
  /** Inflow surplus left over at the refinance month and distributed then. */
  surplusDistributed: number;
  totalContributions: number;
  totalDistributions: number;
}

export interface DealOutputs {
  inputs: DealInputs;
  program: ProgramSummary;
  timeline: TimelineSummary;
  months: MonthRow[];
  /** NOI for the twelve months after the sale, used for valuation. */
  forwardNoi: number[];
  annual: AnnualRow[];
  totals: Totals;
  sourcesUses: { sources: Line[]; uses: Line[]; memo: Line[]; totalSources: number; totalUses: number };
  capitalBudget: Group[];
  refinance: RefinanceResult | null;
  sale: SaleResult;
  amortization: AmortRow[];
  waterfall: { tiers: TierResult[]; byPartner: Record<'gp' | 'lp', PartnerResult> };
  metrics: Record<MetricKey, number | null>;
  flags: Flag[];
  diagnostics: { iterations: number; engineVersion: string };
}

export interface ValidationIssue {
  level: 'error' | 'warning';
  code: string;
  message: string;
  path?: string;
}
