import { describe, expect, it } from 'vitest';
import { run } from '../src/run';
import { checkInvariants } from '../src/invariants';
import { fixtureDeal, simpleDeal } from './fixtures';
import type { DealInputsInput } from '../src/schema';

const variants: Array<[string, DealInputsInput]> = [
  ['fixture', fixtureDeal()],
  ['simple (no debt)', simpleDeal()],
  ['owned land', { ...fixtureDeal(), site: { ...fixtureDeal().site, landOwned: true } }],
  ['land loan', { ...fixtureDeal(), financing: { ...fixtureDeal().financing, landLoan: { enabled: true, ltv: 0.5, ratePct: 0.09, feePct: 0.01 } } }],
  ['mezz', { ...fixtureDeal(), financing: { ...fixtureDeal().financing, mezz: { enabled: true, pctOfCost: 0.1, ratePct: 0.12, feePct: 0.01, repaidAt: 'refi' } } }],
  ['events', { ...fixtureDeal(), events: [
    { id: 'a', label: 'Relocate house', month: 14, amount: 150000, kind: 'cost', category: 'hard' },
    { id: 'b', label: 'Sell house', month: 3, amount: 900000, kind: 'inflow', category: 'inflow' },
  ] }],
  ['commercial', { ...fixtureDeal(), program: { ...fixtureDeal().program, commercial: { enabled: true, grossSF: 4000, rentPerSFYear: 30, vacancyPct: 0.1, tiPerSF: 50, leaseUpMonths: 6, opexPerSFYear: 8 } } }],
  ['no predevelopment', { ...fixtureDeal(), timeline: { predevMonths: 0, constructionMonths: 18, leaseUpMonths: 12 } }],
];

describe('12.2 invariants on every variant (M1: 1, 2, 5)', () => {
  for (const [name, deal] of variants) {
    it(`holds for ${name}`, () => {
      const out = run(deal);
      const violations = checkInvariants(out).filter((v) => [1, 2, 5].includes(v.invariant));
      expect(violations).toEqual([]);
    });
  }
});

describe('12.2 invariant 8: determinism', () => {
  it('running the same inputs twice yields byte-identical outputs', () => {
    const a = JSON.stringify(run(fixtureDeal()));
    const b = JSON.stringify(run(fixtureDeal()));
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(1000);
  });
});

describe('sources & uses and capital budget', () => {
  it('balance to the cent and the capital budget groups sum to TPC', () => {
    const out = run(fixtureDeal());
    expect(Math.abs(out.sourcesUses.totalSources - out.sourcesUses.totalUses)).toBeLessThan(0.01);
    expect(Math.abs(out.sourcesUses.totalUses - out.totals.tpc)).toBeLessThan(0.01);
    const groups = out.capitalBudget.reduce((s, g) => s + g.subtotal, 0);
    expect(Math.abs(groups - out.totals.tpc)).toBeLessThan(0.01);
    for (const g of out.capitalBudget) {
      expect(Math.abs(g.lines.reduce((s, l) => s + l.amount, 0) - g.subtotal)).toBeLessThan(0.01);
      for (const l of g.lines) {
        if (l.children) expect(Math.abs(l.children.reduce((s, c) => s + c.amount, 0) - l.amount)).toBeLessThan(0.01);
        expect(l.perUnit).toBeCloseTo(l.amount / 60, 6);
      }
    }
  });
});

describe('checkInvariants detects corrupted outputs', () => {
  it('reports violations when totals, balances or distributions are tampered with', () => {
    const out = run(fixtureDeal());
    const bad = structuredClone(out);
    bad.totals.tpc += 1000;
    bad.months[5]!.costTotal += 500;
    bad.months[tl(out).R]!.loanBalance += 100;
    bad.months[3]!.distributions.byTier = [-5];
    bad.months[3]!.distributions.gp = 5;
    bad.months[tl(out).R + 1]!.costTotal = 1;
    bad.months[2]!.gpr = 1;
    bad.totals.totalContributions += 7;
    const v = checkInvariants(bad);
    const invariants = new Set(v.map((x) => x.invariant));
    expect(invariants).toEqual(new Set([1, 2, 3, 4, 5]));
  });
});

function tl(out: ReturnType<typeof run>) {
  return out.timeline;
}
