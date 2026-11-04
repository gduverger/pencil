/**
 * Capitalized costs and their distribution over time (7.4) and cost events (7.5).
 * Produces the fixed (non-financing) cost schedule; financing fees, capitalized interest and
 * operating deficits are added by the funding schedule (7.6).
 */
import { EngineError } from './errors';
import { distributionWeights, straightWeights, zeros } from './math';
import type { CostLine, DealInputs, Distribution } from './schema';
import type { Timeline } from './timeline';
import type { CostCategory, ProgramSummary } from './types';

/** A capital budget detail line with its monthly schedule. */
export interface ScheduledLine {
  key: string;
  label: string;
  category: CostCategory;
  total: number;
  monthly: number[];
  children?: ScheduledLine[];
}

export interface CostSchedule {
  /** Months 0..S. */
  monthCount: number;
  lines: ScheduledLine[];
  byCategory: Record<CostCategory, number[]>;
  /** Inflow events by month. */
  inflows: number[];
  inflowLines: ScheduledLine[];
  hardTotal: number;
  softTotal: number;
}

function emptyByCategory(n: number): Record<CostCategory, number[]> {
  return {
    land: zeros(n),
    closing: zeros(n),
    hard: zeros(n),
    hardContingency: zeros(n),
    soft: zeros(n),
    softContingency: zeros(n),
    carryTaxes: zeros(n),
    carryInsurance: zeros(n),
    developerFee: zeros(n),
    commercialTI: zeros(n),
    events: zeros(n),
    financingFees: zeros(n),
    capitalizedInterest: zeros(n),
    operatingDeficit: zeros(n),
  };
}

/** Spread `amount` over months [start, start + weights.length) into a fresh schedule of length n. */
export function spread(amount: number, start: number, weights: readonly number[], n: number): number[] {
  const out = zeros(n);
  for (let k = 0; k < weights.length; k++) {
    const t = start + k;
    if (t >= 0 && t < n) out[t]! += amount * weights[k]!;
  }
  return out;
}

function addInto(target: number[], source: readonly number[]): void {
  for (let i = 0; i < target.length && i < source.length; i++) target[i]! += source[i]!;
}

/** Normalized monthly profile of a schedule (sums to 1), or straight-line over `fallback` when empty. */
function profileOf(schedule: readonly number[], fallbackStart: number, fallbackLen: number, n: number): number[] {
  const total = schedule.reduce((a, b) => a + b, 0);
  if (total > 0) return schedule.map((x) => x / total);
  return spread(1, fallbackStart, straightWeights(fallbackLen), n);
}

/** Default soft-cost timing: predevShare straight-line over [0, P), remainder over [P, O). */
export function softDefaultSchedule(amount: number, predevShare: number, tl: Timeline, n: number): number[] {
  const out = zeros(n);
  const C = tl.O - tl.P;
  if (tl.P === 0) {
    addInto(out, spread(amount, tl.P, straightWeights(C), n));
    return out;
  }
  addInto(out, spread(amount * predevShare, 0, straightWeights(tl.P), n));
  addInto(out, spread(amount * (1 - predevShare), tl.P, straightWeights(C), n));
  return out;
}

function lineSchedule(
  line: CostLine,
  fallback: (amount: number) => number[],
  windowStart: number,
  windowLen: number,
  n: number,
): number[] {
  if (line.distribution) {
    return spread(line.amount, windowStart, distributionWeights(line.distribution, windowLen), n);
  }
  return fallback(line.amount);
}

export function buildCostSchedule(inputs: DealInputs, program: ProgramSummary, tl: Timeline): CostSchedule {
  const n = tl.S + 1;
  const byCategory = emptyByCategory(n);
  const lines: ScheduledLine[] = [];
  const C = tl.O - tl.P;
  if (C < 1) throw new EngineError('bad-timeline', 'construction window must be at least one month');

  const push = (line: ScheduledLine) => {
    lines.push(line);
    addInto(byCategory[line.category], line.monthly);
  };

  // Land and closing at month 0.
  const land = inputs.site.landCost;
  push({ key: 'land', label: inputs.site.landOwned ? 'Land (owned, contributed in kind)' : 'Land', category: 'land', total: land, monthly: spread(land, 0, [1], n) });
  const closing = land * inputs.site.closingCostPct;
  push({ key: 'closing', label: 'Land closing costs', category: 'closing', total: closing, monthly: spread(closing, 0, [1], n) });

  // Hard cost: perGrossSF × GSF_total, or the sum of elaborated lines; S-curve over [P, O) by default.
  const hardDistribution: Distribution = inputs.costs.hard.distribution;
  const hardFallback = (amount: number) => spread(amount, tl.P, distributionWeights(hardDistribution, C), n);
  let hardLine: ScheduledLine;
  if (inputs.costs.hard.lines && inputs.costs.hard.lines.length > 0) {
    const children = inputs.costs.hard.lines.map((l, i) => ({
      key: `hard.lines[${i}]`,
      label: l.label,
      category: 'hard' as const,
      total: l.amount,
      monthly: lineSchedule(l, hardFallback, tl.P, C, n),
    }));
    const monthly = zeros(n);
    for (const c of children) addInto(monthly, c.monthly);
    hardLine = { key: 'hard', label: 'Hard cost', category: 'hard', total: children.reduce((s, c) => s + c.total, 0), monthly, children };
  } else {
    const H = inputs.costs.hard.perGrossSF * program.gsfTotal;
    hardLine = { key: 'hard', label: 'Hard cost', category: 'hard', total: H, monthly: hardFallback(H) };
  }
  push(hardLine);
  const H = hardLine.total;

  // Hard contingency follows the aggregate hard-cost curve.
  const hardContingency = H * inputs.costs.hard.contingencyPct;
  const hardProfile = profileOf(hardLine.monthly, tl.P, C, n);
  push({ key: 'hardContingency', label: 'Hard cost contingency', category: 'hardContingency', total: hardContingency, monthly: hardProfile.map((w) => w * hardContingency) });

  // Soft cost: H × pctOfHard, or elaborated lines; predevShare over [0, P), remainder over [P, O).
  const softFallback = (amount: number) => softDefaultSchedule(amount, inputs.costs.soft.predevShare, tl, n);
  let softLine: ScheduledLine;
  if (inputs.costs.soft.lines && inputs.costs.soft.lines.length > 0) {
    const children = inputs.costs.soft.lines.map((l, i) => ({
      key: `soft.lines[${i}]`,
      label: l.label,
      category: 'soft' as const,
      total: l.amount,
      // A soft line with its own distribution spreads over the whole development window [0, O).
      monthly: lineSchedule(l, softFallback, 0, tl.O, n),
    }));
    const monthly = zeros(n);
    for (const c of children) addInto(monthly, c.monthly);
    softLine = { key: 'soft', label: 'Soft cost', category: 'soft', total: children.reduce((s, c) => s + c.total, 0), monthly, children };
  } else {
    const SC = H * inputs.costs.soft.pctOfHard;
    softLine = { key: 'soft', label: 'Soft cost', category: 'soft', total: SC, monthly: softFallback(SC) };
  }
  push(softLine);
  const SC = softLine.total;

  const softContingency = SC * inputs.costs.soft.contingencyPct;
  const softProfile = profileOf(softLine.monthly, 0, tl.O, n);
  push({ key: 'softContingency', label: 'Soft cost contingency', category: 'softContingency', total: softContingency, monthly: softProfile.map((w) => w * softContingency) });

  // Carry: taxes each month in [0, O); insurance each month in [P, O).
  const taxesMonthly = inputs.costs.carry.taxesDuringConstructionAnnual / 12;
  const taxes = zeros(n);
  for (let t = 0; t < tl.O && t < n; t++) taxes[t] = taxesMonthly;
  push({ key: 'carryTaxes', label: 'Property taxes during development', category: 'carryTaxes', total: taxes.reduce((a, b) => a + b, 0), monthly: taxes });
  const insuranceMonthly = inputs.costs.carry.insuranceDuringConstructionAnnual / 12;
  const insurance = zeros(n);
  for (let t = tl.P; t < tl.O && t < n; t++) insurance[t] = insuranceMonthly;
  push({ key: 'carryInsurance', label: "Builder's risk insurance", category: 'carryInsurance', total: insurance.reduce((a, b) => a + b, 0), monthly: insurance });

  // Developer fee: (H + SC) × pct, straight-line over [0, O).
  const devFee = (H + SC) * inputs.costs.developerFeePct;
  push({ key: 'developerFee', label: 'Developer fee', category: 'developerFee', total: devFee, monthly: spread(devFee, 0, straightWeights(tl.O), n) });

  // Commercial tenant improvements at month O.
  if (inputs.program.commercial.enabled) {
    const ti = inputs.program.commercial.grossSF * inputs.program.commercial.tiPerSF;
    push({ key: 'commercialTI', label: 'Commercial tenant improvements', category: 'commercialTI', total: ti, monthly: spread(ti, tl.O, [1], n) });
  }

  // Events.
  const inflows = zeros(n);
  const inflowLines: ScheduledLine[] = [];
  for (const ev of inputs.events) {
    if (ev.kind === 'cost') {
      push({ key: `event:${ev.id}`, label: ev.label, category: 'events', total: ev.amount, monthly: spread(ev.amount, ev.month, [1], n) });
    } else {
      const monthly = spread(ev.amount, ev.month, [1], n);
      addInto(inflows, monthly);
      inflowLines.push({ key: `event:${ev.id}`, label: ev.label, category: 'events', total: ev.amount, monthly });
    }
  }

  return { monthCount: n, lines, byCategory, inflows, inflowLines, hardTotal: H, softTotal: SC };
}
