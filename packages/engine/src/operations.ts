/**
 * Lease-up and operations (7.7), projected through S + 12 because valuation uses forward NOI.
 * Operating income starts at month O; every line grows by the annual step g(r, t) from month 0.
 */
import { growth, zeros } from './math';
import { gprAt, otherIncomeAt } from './program';
import type { DealInputs } from './schema';
import type { Timeline } from './timeline';
import type { OpexLine, ProgramSummary } from './types';
import { OPEX_LINES } from './types';

export interface OperationsSeries {
  /** Length S + 13: months 0..S plus the twelve forward months used for valuation. */
  length: number;
  gpr: number[];
  occupancy: number[];
  commercialOccupancy: number[];
  vacancyAndCreditLoss: number[];
  otherIncome: number[];
  commercialIncome: number[];
  egi: number[];
  opex: Record<OpexLine, number[]>;
  opexTotal: number[];
  noi: number[];
}

export function emptyOperations(length: number): OperationsSeries {
  const opex = {} as Record<OpexLine, number[]>;
  for (const l of OPEX_LINES) opex[l] = zeros(length);
  return {
    length,
    gpr: zeros(length),
    occupancy: zeros(length),
    commercialOccupancy: zeros(length),
    vacancyAndCreditLoss: zeros(length),
    otherIncome: zeros(length),
    commercialIncome: zeros(length),
    egi: zeros(length),
    opex,
    opexTotal: zeros(length),
    noi: zeros(length),
  };
}

/**
 * Residential occupancy: linear occ(t) = occ_s × min(1, (t − O + 1) / L), or units-per-month
 * occ(t) = min(occ_s, units × (t − O + 1) / totalUnits); occ_s for t ≥ Z; 0 before O.
 */
export function occupancyAt(inputs: DealInputs, tl: Timeline, t: number): number {
  if (t < tl.O) return 0;
  const occS = 1 - inputs.operations.stabilizedVacancyPct;
  if (t >= tl.Z) return occS;
  const elapsed = t - tl.O + 1;
  const absorption = inputs.operations.absorption;
  if (absorption.kind === 'unitsPerMonth') {
    return Math.min(occS, (absorption.units * elapsed) / inputs.program.totalUnits);
  }
  const L = tl.Z - tl.O;
  return occS * Math.min(1, elapsed / L);
}

/** Commercial occupancy: its own linear lease-up over `commercial.leaseUpMonths` from O. */
export function commercialOccupancyAt(inputs: DealInputs, tl: Timeline, t: number): number {
  if (!inputs.program.commercial.enabled || t < tl.O) return 0;
  const L = inputs.program.commercial.leaseUpMonths;
  if (L <= 0) return 1;
  return Math.min(1, (t - tl.O + 1) / L);
}

export function computeOperations(
  inputs: DealInputs,
  program: ProgramSummary,
  tl: Timeline,
): OperationsSeries {
  const length = tl.S + 13;
  const ops = emptyOperations(length);
  const { operations: op, program: prog } = inputs;
  const units = prog.totalUnits;
  const com = prog.commercial;

  for (let t = tl.O; t < length; t++) {
    const occ = occupancyAt(inputs, tl, t);
    const occC = commercialOccupancyAt(inputs, tl, t);
    const gpr = gprAt(inputs, program, t);
    const oi = otherIncomeAt(inputs, t);
    const residentialCollected = gpr * occ * (1 - op.creditLossPct) + oi * occ;
    const commercialIncome = com.enabled
      ? ((com.grossSF * com.rentPerSFYear) / 12) *
        growth(op.rentGrowthPct, t) *
        occC *
        (1 - com.vacancyPct)
      : 0;
    const egi = residentialCollected + commercialIncome;

    const gExp = growth(op.expenseGrowthPct, t);
    const perUnit = (annual: number) => ((annual * units) / 12) * gExp;
    const opex: Record<OpexLine, number> = {
      taxes: (op.opex.taxesStabilizedAnnual / 12) * gExp,
      insurance: perUnit(op.opex.insurancePerUnit),
      repairs: perUnit(op.opex.repairsPerUnit),
      payroll: perUnit(op.opex.payrollPerUnit),
      utilities: perUnit(op.opex.utilitiesPerUnit),
      admin: perUnit(op.opex.adminPerUnit),
      marketing: perUnit(op.opex.marketingPerUnit),
      reserves: perUnit(op.opex.reservesPerUnit),
      management: op.opex.managementPctEGI * egi,
      commercial: com.enabled ? ((com.grossSF * com.opexPerSFYear) / 12) * gExp : 0,
    };
    let opexTotal = 0;
    for (const l of OPEX_LINES) {
      ops.opex[l][t] = opex[l];
      opexTotal += opex[l];
    }

    ops.gpr[t] = gpr;
    ops.occupancy[t] = occ;
    ops.commercialOccupancy[t] = occC;
    ops.otherIncome[t] = oi;
    ops.commercialIncome[t] = commercialIncome;
    ops.vacancyAndCreditLoss[t] = gpr + oi - residentialCollected;
    ops.egi[t] = egi;
    ops.opexTotal[t] = opexTotal;
    ops.noi[t] = egi - opexTotal;
  }
  return ops;
}
