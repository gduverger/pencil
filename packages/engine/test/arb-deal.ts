import fc from 'fast-check';
import type { DealInputsInput, Distribution } from '../src/schema';

/** Random valid DealInputs per 12.4. */
export function arbDeal(): fc.Arbitrary<DealInputsInput> {
  const pct = (lo: number, hi: number) => fc.double({ min: lo, max: hi, noNaN: true, noDefaultInfinity: true });
  const money = (lo: number, hi: number) => fc.integer({ min: lo, max: hi });
  const distribution = (len: number): fc.Arbitrary<Distribution> =>
    fc.oneof(
      fc.constant<Distribution>({ kind: 'scurve' }),
      fc.constant<Distribution>({ kind: 'straight' }),
      fc.array(fc.integer({ min: 1, max: 9 }), { minLength: len, maxLength: len }).map((weights) => ({ kind: 'custom', weights }) as Distribution),
    );
  return fc
    .record({
      totalUnits: fc.integer({ min: 20, max: 300 }),
      predev: fc.integer({ min: 0, max: 18 }),
      construction: fc.integer({ min: 6, max: 30 }),
      leaseUp: fc.integer({ min: 0, max: 18 }),
      extraHold: fc.integer({ min: 0, max: 110 }),
      landCost: money(0, 20_000_000),
      landOwned: fc.boolean(),
      perGrossSF: money(150, 600),
      pctOfHard: pct(0.1, 0.4),
      rate: pct(0.03, 0.12),
      permRate: pct(0.03, 0.12),
      mezzRate: pct(0.08, 0.15),
      ltc: pct(0, 0.75),
      mezzOn: fc.boolean(),
      mezzPct: pct(0.05, 0.15),
      landLoanOn: fc.boolean(),
      permOn: fc.boolean(),
      refiOffset: fc.integer({ min: 0, max: 6 }),
      ioMonths: fc.integer({ min: 0, max: 24 }),
      commercialOn: fc.boolean(),
      affordableOn: fc.boolean(),
      capitalize: fc.boolean(),
      vacancy: pct(0.03, 0.12),
      exitCap: pct(0.045, 0.075),
      refiCap: pct(0.045, 0.075),
      rentMultiplier: pct(0.7, 1.5),
      growth: pct(0, 0.04),
      absorption: fc.oneof(fc.constant({ kind: 'linear' } as const), fc.integer({ min: 2, max: 40 }).map((units) => ({ kind: 'unitsPerMonth', units }) as const)),
      events: fc.array(
        fc.record({
          month: fc.integer({ min: 0, max: 60 }),
          amount: money(10_000, 2_000_000),
          kind: fc.constantFrom('cost', 'inflow'),
          category: fc.constantFrom('land', 'hard', 'soft', 'other'),
        }),
        { minLength: 0, maxLength: 3 },
      ),
      hardDist: fc.integer({ min: 6, max: 30 }).chain((len) => distribution(len)),
      taxes: money(50_000, 1_500_000),
    })
    .map((r): DealInputsInput => {
      const O = r.predev + r.construction;
      const Z = O + r.leaseUp;
      const hold = Math.max(60, Math.min(180, Z + r.refiOffset + r.extraHold));
      const C = r.construction;
      const generated = r.hardDist;
      const hardDist: Distribution =
        generated.kind === 'custom'
          ? { kind: 'custom', weights: Array.from({ length: C }, (_, i) => generated.weights[i % generated.weights.length]!) }
          : generated;
      return {
        meta: { name: 'random', analysisMonth: '2026-01', holdMonths: hold },
        site: { lotSF: 50_000, landCost: r.landCost, landOwned: r.landOwned, closingCostPct: 0.02 },
        program: {
          totalUnits: r.totalUnits,
          unitTypes: [
            { key: 'studio', mixPct: 0.15, avgSF: 450, rentPerMonth: 2200 * r.rentMultiplier },
            { key: '1BR', mixPct: 0.35, avgSF: 650, rentPerMonth: 2700 * r.rentMultiplier },
            { key: '2BR', mixPct: 0.35, avgSF: 950, rentPerMonth: 3300 * r.rentMultiplier },
            { key: '3BR', mixPct: 0.15, avgSF: 1200, rentPerMonth: 3900 * r.rentMultiplier },
          ],
          commercial: { enabled: r.commercialOn, grossSF: 3000, rentPerSFYear: 30, vacancyPct: 0.1, tiPerSF: 50, leaseUpMonths: 6, opexPerSFYear: 8 },
          affordable: { enabled: r.affordableOn, pctUnits: 0.15, rentDiscountPct: 0.4 },
        },
        timeline: { predevMonths: r.predev, constructionMonths: r.construction, leaseUpMonths: r.leaseUp },
        costs: { hard: { perGrossSF: r.perGrossSF, distribution: hardDist }, soft: { pctOfHard: r.pctOfHard }, carry: { taxesDuringConstructionAnnual: 50_000, insuranceDuringConstructionAnnual: 30_000 }, developerFeePct: 0.03 },
        events: r.events.map((e, i) => ({
          id: `e${i}`,
          label: `Event ${i}`,
          month: e.kind === 'cost' ? Math.min(e.month, O) : Math.min(e.month, hold),
          amount: e.amount,
          kind: e.kind,
          category: e.kind === 'inflow' ? 'inflow' : e.category,
        })),
        financing: {
          constructionLoan: { ltc: r.ltc, ratePct: r.rate, feePct: 0.01 },
          landLoan: { enabled: r.landLoanOn && !r.landOwned, ltv: 0.5, ratePct: r.rate + 0.01, feePct: 0.01 },
          mezz: { enabled: r.mezzOn, pctOfCost: r.mezzPct, ratePct: r.mezzRate, feePct: 0.01, repaidAt: r.mezzOn && r.permOn ? 'refi' : 'sale' },
          permanent: { enabled: r.permOn, monthsAfterStabilization: r.refiOffset, maxLTV: 0.65, minDSCR: 1.25, ratePct: r.permRate, amortYears: 30, ioMonths: r.ioMonths, feePct: 0.01, refiCapRatePct: r.refiCap },
          capitalizeOperatingDeficits: r.capitalize,
        },
        operations: { stabilizedVacancyPct: r.vacancy, rentGrowthPct: r.growth, expenseGrowthPct: r.growth, otherIncomeGrowthPct: r.growth, absorption: r.absorption, opex: { taxesStabilizedAnnual: r.taxes } },
        exit: { exitCapRatePct: r.exitCap },
        equity: { gpPct: 0.1, lpPct: 0.9 },
      };
    });
}

