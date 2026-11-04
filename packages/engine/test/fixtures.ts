import { parseInputs, type DealInputs, type DealInputsInput } from '../src/schema';

/** A representative 60-unit Needham deal used across the engine tests and the CLI demo. */
export function fixtureDeal(): DealInputsInput {
  return {
    meta: { name: 'Fixture — 60 units, Needham', analysisMonth: '2026-01', holdMonths: 120 },
    site: { lotSF: 60000, landCost: 4_000_000, landOwned: false, closingCostPct: 0.02 },
    program: {
      totalUnits: 60,
      unitTypes: [
        { key: 'studio', mixPct: 0.1, avgSF: 450, rentPerMonth: 2200 },
        { key: '1BR', mixPct: 0.4, avgSF: 650, rentPerMonth: 2700 },
        { key: '2BR', mixPct: 0.4, avgSF: 950, rentPerMonth: 3300 },
        { key: '3BR', mixPct: 0.1, avgSF: 1200, rentPerMonth: 3900 },
      ],
      efficiency: 0.85,
      otherIncomePerUnitMonth: 75,
    },
    timeline: { predevMonths: 12, constructionMonths: 18, leaseUpMonths: 12 },
    costs: {
      hard: { perGrossSF: 350, contingencyPct: 0.05 },
      soft: { pctOfHard: 0.25, contingencyPct: 0.05, predevShare: 0.6 },
      carry: { taxesDuringConstructionAnnual: 60000, insuranceDuringConstructionAnnual: 40000 },
      developerFeePct: 0.03,
    },
    financing: {
      constructionLoan: { ltc: 0.65, ratePct: 0.08, feePct: 0.01 },
      permanent: { enabled: true, maxLTV: 0.65, minDSCR: 1.25, ratePct: 0.06, amortYears: 30, ioMonths: 0, feePct: 0.01, refiCapRatePct: 0.055 },
    },
    operations: {
      stabilizedVacancyPct: 0.05,
      creditLossPct: 0.005,
      rentGrowthPct: 0.03,
      expenseGrowthPct: 0.03,
      otherIncomeGrowthPct: 0.03,
      opex: {
        taxesStabilizedAnnual: 250000,
        insurancePerUnit: 600,
        repairsPerUnit: 500,
        payrollPerUnit: 1200,
        utilitiesPerUnit: 500,
        adminPerUnit: 300,
        marketingPerUnit: 200,
        reservesPerUnit: 300,
        managementPctEGI: 0.03,
      },
    },
    exit: { exitCapRatePct: 0.055, brokerFeePct: 0.02, closingCostPct: 0.01 },
    equity: { gpPct: 0.1, lpPct: 0.9 },
  };
}

export function fixtureInputs(overrides: (d: DealInputsInput) => DealInputsInput = (d) => d): DealInputs {
  return parseInputs(overrides(fixtureDeal()));
}

/**
 * A deliberately simple deal for hand arithmetic: 10 one-bedroom units of 850 SF at 85%
 * efficiency → NRSF 8,500, GSF 10,000; hard $300/GSF → H = 3,000,000; soft 20% → 600,000;
 * no contingencies, carry, fee or land; P = 6, C = 12, L = 0, hold 60.
 */
export function simpleDeal(): DealInputsInput {
  return {
    meta: { name: 'Simple', analysisMonth: '2026-01', holdMonths: 60 },
    site: { lotSF: 10000, landCost: 0, landOwned: false, closingCostPct: 0 },
    program: {
      totalUnits: 10,
      unitTypes: [{ key: '1BR', mixPct: 1, avgSF: 850, rentPerMonth: 2500 }],
      efficiency: 0.85,
      otherIncomePerUnitMonth: 0,
    },
    timeline: { predevMonths: 6, constructionMonths: 12, leaseUpMonths: 0 },
    costs: {
      hard: { perGrossSF: 300, contingencyPct: 0, distribution: { kind: 'straight' } },
      soft: { pctOfHard: 0.2, contingencyPct: 0, predevShare: 0.6 },
      carry: { taxesDuringConstructionAnnual: 0, insuranceDuringConstructionAnnual: 0 },
      developerFeePct: 0,
    },
    financing: {
      constructionLoan: { ltc: 0, ratePct: 0.08, feePct: 0 },
      permanent: { enabled: false },
    },
    operations: { opex: { taxesStabilizedAnnual: 30000 } },
    equity: { gpPct: 0.1, lpPct: 0.9 },
  };
}
