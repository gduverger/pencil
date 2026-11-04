import { describe, expect, it } from 'vitest';
import { run } from '../src/run';
import { checkInvariants } from '../src/invariants';
import { fixtureDeal, simpleDeal } from './fixtures';
import type { DealInputsInput } from '../src/schema';

const d = fixtureDeal();
const variants: Array<[string, DealInputsInput]> = [
  ['fixture', d],
  ['simple (no debt, no permanent)', simpleDeal()],
  ['owned land', { ...d, site: { ...d.site, landOwned: true } }],
  ['land loan', { ...d, financing: { ...d.financing, landLoan: { enabled: true, ltv: 0.5, ratePct: 0.09, feePct: 0.01 } } }],
  ['mezz at refi', { ...d, financing: { ...d.financing, mezz: { enabled: true, pctOfCost: 0.1, ratePct: 0.12, feePct: 0.01, repaidAt: 'refi' } } }],
  ['mezz at sale', { ...d, financing: { ...d.financing, mezz: { enabled: true, pctOfCost: 0.1, ratePct: 0.12, feePct: 0.01, repaidAt: 'sale' } } }],
  ['no permanent loan', { ...d, financing: { ...d.financing, permanent: { ...d.financing!.permanent, enabled: false } } }],
  ['refi offset 6 with surplus', { ...d, financing: { ...d.financing, permanent: { ...d.financing!.permanent, monthsAfterStabilization: 6 } } }],
  ['deficits not capitalized', { ...d, financing: { ...d.financing, capitalizeOperatingDeficits: false } }],
  ['events incl. post-refinance inflow', { ...d, events: [
    { id: 'a', label: 'Relocate house', month: 14, amount: 150000, kind: 'cost', category: 'hard' },
    { id: 'b', label: 'Sell house', month: 3, amount: 900000, kind: 'inflow', category: 'inflow' },
    { id: 'c', label: 'Insurance recovery', month: 60, amount: 50000, kind: 'inflow', category: 'inflow' },
  ] }],
  ['commercial and affordable', { ...d, program: { ...d.program, commercial: { enabled: true, grossSF: 4000, rentPerSFYear: 30, vacancyPct: 0.1, tiPerSF: 50, leaseUpMonths: 6, opexPerSFYear: 8 }, affordable: { enabled: true, pctUnits: 0.15, rentDiscountPct: 0.4 } } }],
  ['refinance shortfall', { ...d, site: { ...d.site, landCost: 4_000_000 }, costs: { ...d.costs, hard: { perGrossSF: 350 } } }],
  ['negative sale', { ...d, exit: { ...d.exit, exitCapRatePct: 0.5 } }],
  ['IO permanent loan', { ...d, financing: { ...d.financing, permanent: { ...d.financing!.permanent, ioMonths: 36 } } }],
  ['units per month absorption', { ...d, operations: { ...d.operations, absorption: { kind: 'unitsPerMonth', units: 8 } } }],
  ['elaborated hard and soft lines', { ...d, costs: { ...d.costs, hard: { ...d.costs!.hard, lines: [{ label: 'A', amount: 9_000_000 }, { label: 'B', amount: 8_000_000, distribution: { kind: 'straight' } }] }, soft: { ...d.costs!.soft, lines: [{ label: 'Arch', amount: 3_000_000 }, { label: 'Permits', amount: 500_000, distribution: { kind: 'custom', weights: [1, ...new Array(29).fill(0)] } }] } } }],
  ['short hold equals stabilization', { ...d, meta: { ...d.meta, holdMonths: 42 } }],
];

describe('12.2 invariants 1–5 on every variant', () => {
  for (const [name, deal] of variants) {
    it(`hold for ${name}`, () => {
      const out = run(deal);
      expect(checkInvariants(out)).toEqual([]);
    });
  }
});

describe('12.2 invariant 7: monotonicity', () => {
  const base = run(d);
  it('raising the exit cap lowers sale value and project IRR', () => {
    const higher = run({ ...d, exit: { ...d.exit, exitCapRatePct: 0.065 } });
    expect(higher.sale.value).toBeLessThan(base.sale.value);
    expect(higher.metrics.projectIrr!).toBeLessThan(base.metrics.projectIrr!);
  });
  it('raising hard cost $/SF lowers yield on cost', () => {
    const higher = run({ ...d, costs: { ...d.costs, hard: { ...d.costs!.hard, perGrossSF: 340 } } });
    expect(higher.metrics.yieldOnCost!).toBeLessThan(base.metrics.yieldOnCost!);
  });
  it('raising rents raises NOI in every operating month', () => {
    const higher = run({ ...d, program: { ...d.program, unitTypes: d.program!.unitTypes!.map((u) => ({ ...u, rentPerMonth: u.rentPerMonth! * 1.1 })) } });
    for (let t = 30; t <= 120; t++) expect(higher.months[t]!.noi).toBeGreaterThan(base.months[t]!.noi);
  });
});

describe('12.2 invariant 8: determinism of the full pipeline', () => {
  it('two runs are byte-identical', () => {
    expect(JSON.stringify(run(d))).toBe(JSON.stringify(run(d)));
  });
});
