/** Builders for the sources & uses statement and the capital budget from a funding result. */
import type { CostSchedule, ScheduledLine } from './costs';
import type { FundingResult } from './funding';
import type { DealInputs } from './schema';
import type { CostCategory, Group, Line, ProgramSummary, Totals } from './types';
import { COST_CATEGORIES } from './types';

export interface Denominators {
  units: number;
  gsf: number;
}

export function makeLine(key: string, label: string, amount: number, d: Denominators, children?: Line[]): Line {
  const line: Line = {
    key,
    label,
    amount,
    perUnit: d.units > 0 ? amount / d.units : 0,
    perGSF: d.gsf > 0 ? amount / d.gsf : 0,
  };
  if (children && children.length > 0) line.children = children;
  return line;
}

function scheduledToLine(l: ScheduledLine, d: Denominators): Line {
  return makeLine(l.key, l.label, l.total, d, l.children?.map((c) => scheduledToLine(c, d)));
}

function group(key: string, label: string, lines: Line[], d: Denominators): Group {
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  return { key, label, lines, subtotal, perUnit: d.units > 0 ? subtotal / d.units : 0, perGSF: d.gsf > 0 ? subtotal / d.gsf : 0 };
}

export function buildTotals(funding: FundingResult, refinanceShortfallAndPostDeficits: number, permanentLoan: number, totalContributions: number, totalDistributions: number): Totals {
  const byCategory = {} as Record<CostCategory, number>;
  for (const c of COST_CATEGORIES) byCategory[c] = 0;
  for (const m of funding.months) for (const c of COST_CATEGORIES) byCategory[c] += m.costs[c];
  void refinanceShortfallAndPostDeficits;
  return {
    tpc: funding.tpc,
    byCategory,
    equity: funding.equityCash + funding.equityInKind,
    equityCash: funding.equityCash,
    equityInKind: funding.equityInKind,
    equityCommitment: funding.equityCommitment,
    constructionLoan: funding.loanBalanceAtR,
    constructionLoanCommitment: funding.lc,
    mezz: funding.mezzBalanceAtR,
    mezzCommitment: funding.mezzCommitment,
    permanentLoan,
    capitalizedInterest: funding.interest.total,
    financingFees: funding.fees.total,
    operatingDeficit: funding.operatingDeficitCapitalized,
    inflowEvents: funding.months.reduce((s, m) => s + m.inflows, 0),
    leaseUpNoi: funding.leaseUpNoiApplied,
    surplusDistributed: funding.surplusAtR,
    totalContributions,
    totalDistributions,
  };
}

export function buildSourcesUses(inputs: DealInputs, cost: CostSchedule, funding: FundingResult, totals: Totals, program: ProgramSummary, permanentLoan: number) {
  const d: Denominators = { units: program.totalUnits, gsf: program.gsfTotal };
  const gpCash = funding.months.reduce((s, m) => s + m.equityCashGp, 0);
  const lpCash = funding.months.reduce((s, m) => s + m.equityCashLp, 0);
  const sources: Line[] = [];
  sources.push(makeLine('equity.gp', 'GP equity (cash)', gpCash, d));
  if (funding.equityInKind > 0) sources.push(makeLine('equity.gpInKind', 'GP equity (land in kind)', funding.equityInKind, d));
  sources.push(makeLine('equity.lp', 'LP equity', lpCash, d));
  if (inputs.financing.mezz.enabled && totals.mezz > 0) {
    sources.push(makeLine('mezz', 'Mezzanine (drawn, incl. capitalized interest)', totals.mezz, d));
  }
  sources.push(makeLine('constructionLoan', 'Construction loan (drawn, incl. capitalized interest)', totals.constructionLoan, d));
  if (totals.inflowEvents > 0) {
    const applied = funding.inflowsApplied;
    const children = cost.inflowLines.map((l) => makeLine(l.key, l.label, l.total, d));
    sources.push(makeLine('inflows', applied < totals.inflowEvents ? 'Inflow events (applied to costs)' : 'Inflow events', applied, d, children));
  }
  if (funding.leaseUpNoiApplied > 0) sources.push(makeLine('leaseUpNoi', 'Net operating income before refinance', funding.leaseUpNoiApplied, d));

  const byCat = totals.byCategory;
  const uses: Line[] = [];
  uses.push(makeLine('land', inputs.site.landOwned ? 'Land (in kind)' : 'Land', byCat.land, d));
  uses.push(makeLine('closing', 'Land closing costs', byCat.closing, d));
  uses.push(makeLine('hard', 'Hard cost', byCat.hard, d));
  uses.push(makeLine('hardContingency', 'Hard cost contingency', byCat.hardContingency, d));
  uses.push(makeLine('soft', 'Soft cost', byCat.soft, d));
  uses.push(makeLine('softContingency', 'Soft cost contingency', byCat.softContingency, d));
  uses.push(makeLine('carry', 'Carry (taxes and insurance during development)', byCat.carryTaxes + byCat.carryInsurance, d));
  if (byCat.developerFee > 0) uses.push(makeLine('developerFee', 'Developer fee', byCat.developerFee, d));
  if (byCat.commercialTI > 0) uses.push(makeLine('commercialTI', 'Commercial tenant improvements', byCat.commercialTI, d));
  uses.push(makeLine('financingFees', 'Financing fees', byCat.financingFees, d));
  uses.push(makeLine('capitalizedInterest', 'Capitalized interest', byCat.capitalizedInterest, d));
  if (byCat.operatingDeficit > 0) uses.push(makeLine('operatingDeficit', 'Operating deficit (lease-up)', byCat.operatingDeficit, d));
  const eventLines = cost.lines.filter((l) => l.category === 'events');
  if (eventLines.length > 0) {
    uses.push(makeLine('events', 'Events', byCat.events, d, eventLines.map((l) => makeLine(l.key, l.label, l.total, d))));
  }

  const memo: Line[] = [];
  if (inputs.financing.permanent.enabled) memo.push(makeLine('permanentLoan', 'Permanent loan at refinance (memo)', permanentLoan, d));

  const totalSources = sources.reduce((s, l) => s + l.amount, 0);
  const totalUses = uses.reduce((s, l) => s + l.amount, 0);
  return { sources, uses, memo, totalSources, totalUses };
}

export function buildCapitalBudget(inputs: DealInputs, cost: CostSchedule, funding: FundingResult, totals: Totals, program: ProgramSummary): Group[] {
  const d: Denominators = { units: program.totalUnits, gsf: program.gsfTotal };
  const byKey = new Map(cost.lines.map((l) => [l.key, l] as const));
  const line = (key: string) => {
    const l = byKey.get(key);
    return l ? scheduledToLine(l, d) : undefined;
  };
  const events = (category: 'land' | 'hard' | 'soft' | 'other') =>
    inputs.events
      .filter((e) => e.kind === 'cost' && e.category === category)
      .map((e) => makeLine(`event:${e.id}`, e.label, e.amount, d));

  const groups: Group[] = [];
  groups.push(group('land', 'Land', [line('land')!, line('closing')!, ...events('land')], d));
  groups.push(group('hard', 'Hard costs', [line('hard')!, line('hardContingency')!, ...events('hard')], d));
  groups.push(group('soft', 'Soft costs', [line('soft')!, line('softContingency')!, ...events('soft')], d));
  groups.push(group('carry', 'Carry', [line('carryTaxes')!, line('carryInsurance')!], d));
  const devFee = line('developerFee');
  if (devFee && devFee.amount > 0) groups.push(group('developerFee', 'Developer fee', [devFee], d));
  const ti = line('commercialTI');
  if (ti) groups.push(group('commercialTI', 'Commercial tenant improvements', [ti], d));
  const other = events('other');
  if (other.length > 0) groups.push(group('otherEvents', 'Other events', other, d));

  const financing: Line[] = [];
  const feeChildren: Line[] = [];
  if (funding.fees.land > 0) feeChildren.push(makeLine('fees.land', 'Land loan fee', funding.fees.land, d));
  if (funding.fees.construction > 0) feeChildren.push(makeLine('fees.construction', 'Construction loan fee', funding.fees.construction, d));
  if (funding.fees.mezz > 0) feeChildren.push(makeLine('fees.mezz', 'Mezzanine fee', funding.fees.mezz, d));
  financing.push(makeLine('financingFees', 'Financing fees', funding.fees.total, d, feeChildren));
  const interestChildren: Line[] = [];
  if (funding.interest.land > 0) interestChildren.push(makeLine('interest.land', 'Land loan interest', funding.interest.land, d));
  if (funding.interest.construction > 0) interestChildren.push(makeLine('interest.construction', 'Construction loan interest', funding.interest.construction, d));
  if (funding.interest.mezz > 0) interestChildren.push(makeLine('interest.mezz', 'Mezzanine interest', funding.interest.mezz, d));
  financing.push(makeLine('capitalizedInterest', 'Capitalized interest', funding.interest.total, d, interestChildren));
  groups.push(group('financing', 'Financing', financing, d));
  if (totals.operatingDeficit > 0) {
    groups.push(group('operatingDeficit', 'Operating deficit (lease-up)', [makeLine('operatingDeficit', 'Capitalized operating deficit', totals.operatingDeficit, d)], d));
  }
  return groups;
}
