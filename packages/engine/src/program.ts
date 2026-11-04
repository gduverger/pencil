/** Program and revenue basis (7.3). */
import { growth, largestRemainder } from './math';
import type { DealInputs } from './schema';
import type { ProgramSummary } from './types';

export function computeProgram(inputs: DealInputs): ProgramSummary {
  const { program } = inputs;
  const units = largestRemainder(
    program.totalUnits,
    program.unitTypes.map((u) => u.mixPct),
  );
  const affordablePct = program.affordable.enabled ? program.affordable.pctUnits : 0;
  const unitTypes = program.unitTypes.map((u, i) => {
    const n = units[i] ?? 0;
    return {
      key: u.key,
      mixPct: u.mixPct,
      units: n,
      avgSF: u.avgSF,
      rentPerMonth: u.rentPerMonth,
      nrsf: n * u.avgSF,
      affordableUnits: n * affordablePct,
    };
  });
  const nrsf = unitTypes.reduce((s, u) => s + u.nrsf, 0);
  const gsf = nrsf / program.efficiency;
  const commercialSF = program.commercial.enabled ? program.commercial.grossSF : 0;
  return {
    totalUnits: program.totalUnits,
    unitTypes,
    nrsf,
    gsf,
    commercialSF,
    gsfTotal: gsf + commercialSF,
    efficiency: program.efficiency,
  };
}

/**
 * Monthly gross potential rent: GPR(t) = Σ units_i × rent_i × g(rentGrowth, t), with the affordable
 * share of each type's units (when on) at rent_i × (1 − rentDiscountPct). The affordable share is
 * applied as a fraction of each type's units (see docs/decisions.md).
 */
export function gprAt(inputs: DealInputs, program: ProgramSummary, t: number): number {
  const g = growth(inputs.operations.rentGrowthPct, t);
  const discount = inputs.program.affordable.enabled ? inputs.program.affordable.rentDiscountPct : 0;
  let total = 0;
  for (const u of program.unitTypes) {
    const market = u.units - u.affordableUnits;
    total += (market * u.rentPerMonth + u.affordableUnits * u.rentPerMonth * (1 - discount)) * g;
  }
  return total;
}

/** Other income: OI(t) = totalUnits × otherIncomePerUnitMonth × g(otherIncomeGrowth, t). */
export function otherIncomeAt(inputs: DealInputs, t: number): number {
  return (
    inputs.program.totalUnits *
    inputs.program.otherIncomePerUnitMonth *
    growth(inputs.operations.otherIncomeGrowthPct, t)
  );
}
