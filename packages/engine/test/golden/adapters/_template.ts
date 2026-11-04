/**
 * Template adapter. Copy to `<model>.ts`, fill in the mapping from the extracted workbook inputs
 * to DealInputs, and list every convention difference in `notes`.
 */
import type { DealInputsInput } from '../../../src/schema';
import type { GoldenAdapter, GoldenFile } from '../types';

export const adapt: GoldenAdapter = (golden: GoldenFile) => {
  const num = (name: string): number => {
    const entry = golden.inputs[name];
    if (!entry || typeof entry.value !== 'number')
      throw new Error(`golden input ${name} is missing or not numeric`);
    return entry.value;
  };
  const inputs: DealInputsInput = {
    meta: { name: golden.model, analysisMonth: '2026-01', holdMonths: num('holdMonths') },
    site: { landCost: num('landCost') },
    program: { totalUnits: num('totalUnits') },
    timeline: {
      constructionMonths: num('constructionMonths'),
      leaseUpMonths: num('leaseUpMonths'),
    },
    costs: {
      hard: { lines: [{ label: 'Hard cost (workbook total)', amount: num('hardCost') }] },
      soft: { lines: [{ label: 'Soft cost (workbook total)', amount: num('softCost') }] },
    },
    financing: {
      constructionLoan: { ltc: num('ltc'), ratePct: num('constructionRate') },
      permanent: { ratePct: num('permanentRate'), amortYears: num('amortYears') },
    },
    operations: {
      stabilizedVacancyPct: num('vacancy'),
      rentGrowthPct: num('rentGrowth'),
      expenseGrowthPct: num('expenseGrowth'),
    },
    exit: { exitCapRatePct: num('exitCapRate') },
  };
  return {
    inputs,
    notes: [
      'Template adapter: replace with the model-specific mapping and document convention differences.',
    ],
    tolerances: {},
  };
};
