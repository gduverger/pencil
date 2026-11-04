import { describe, expect, it } from 'vitest';
import { run } from '../src/run';
import { EngineError } from '../src/errors';
import { solveFunding } from '../src/funding';
import { buildCostSchedule } from '../src/costs';
import { computeProgram } from '../src/program';
import { buildTimeline } from '../src/timeline';
import { zeros } from '../src/math';
import { parseInputs, type DealInputsInput } from '../src/schema';
import { fixtureDeal, fixtureInputs, simpleDeal } from './fixtures';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function fundingFor(raw: DealInputsInput, noi?: number[]) {
  const inputs = parseInputs(raw);
  const tl = buildTimeline(inputs);
  const program = computeProgram(inputs);
  const cost = buildCostSchedule(inputs, program, tl);
  return { inputs, tl, cost, funding: solveFunding(inputs, tl, cost, noi ?? zeros(tl.S + 13)) };
}

describe('7.6 funding order, construction interest and the fixed point', () => {
  it('ltc = 0 converges in one iteration with zero interest and equity funds everything', () => {
    const { funding } = fundingFor(simpleDeal());
    expect(funding.iterations).toBe(1);
    expect(funding.interest.total).toBe(0);
    // TPC = H + SC = 3,000,000 + 600,000 = 3,600,000; E = TPC − 0 − 0
    expect(funding.tpc).toBeCloseTo(3_600_000, 6);
    expect(funding.equityCommitment).toBeCloseTo(3_600_000, 6);
    expect(funding.equityCash).toBeCloseTo(3_600_000, 6);
    expect(funding.loanBalanceAtR).toBe(0);
    // GP 10% / LP 90% on every call
    const gp = sum(funding.months.map((m) => m.equityCashGp));
    const lp = sum(funding.months.map((m) => m.equityCashLp));
    expect(gp).toBeCloseTo(360000, 6);
    expect(lp).toBeCloseTo(3_240_000, 6);
  });

  it('ltc = 0.65 converges in under 10 iterations; capitalized interest equals the sum of monthly rows', () => {
    const { funding, tl } = fundingFor(fixtureDeal());
    expect(funding.iterations).toBeLessThan(10);
    expect(funding.iterations).toBeGreaterThan(1);
    const rows = sum(funding.months.map((m) => m.interestConstruction));
    expect(funding.interest.construction).toBeCloseTo(rows, 6);
    expect(funding.interest.total).toBeCloseTo(sum(funding.months.map((m) => m.interestConstruction + m.interestLand + m.interestMezz)), 6);
    // Lc = 0.65 × TPC within the $1 tolerance of the fixed point
    expect(Math.abs(funding.lc - 0.65 * funding.tpc)).toBeLessThan(1);
    // Fee 1% of Lc at month P = 12
    expect(funding.months[tl.P]!.costs.financingFees).toBeCloseTo(funding.lc * 0.01, 6);
    // E = TPC − Lc − M
    expect(Math.abs(funding.equityCash - (funding.tpc - funding.lc))).toBeLessThan(1);
    // Loan balance at R = draws + interest, and equals Lc when there are no inflows or lease-up NOI
    const draws = sum(funding.months.map((m) => m.loanDraw));
    expect(funding.loanBalanceAtR).toBeCloseTo(draws + funding.interest.construction, 6);
    expect(Math.abs(funding.loanBalanceAtR - funding.lc)).toBeLessThan(1);
  });

  it('interest is B_{t−1} × r / 12 and is added to the balance', () => {
    const { funding } = fundingFor(fixtureDeal());
    for (let t = 1; t < funding.months.length; t++) {
      const prev = funding.months[t - 1]!;
      const cur = funding.months[t]!;
      if (t > 42) break; // R = 42 for the fixture
      expect(cur.interestConstruction).toBeCloseTo((prev.loanBalance * 0.08) / 12, 6);
      expect(cur.loanBalance).toBeCloseTo(prev.loanBalance + cur.loanDraw + cur.interestConstruction, 6);
    }
  });

  it('funds equity first, then the construction loan; no loan draw until equity is exhausted', () => {
    const { funding } = fundingFor(fixtureDeal());
    const firstLoanMonth = funding.months.findIndex((m) => m.loanDraw > 0);
    expect(firstLoanMonth).toBeGreaterThan(0);
    const equityBefore = sum(funding.months.slice(0, firstLoanMonth).map((m) => m.equityCashGp + m.equityCashLp));
    const equityAfter = sum(funding.months.slice(firstLoanMonth + 1).map((m) => m.equityCashGp + m.equityCashLp));
    expect(equityBefore).toBeGreaterThan(0);
    expect(equityAfter).toBe(0);
    for (let t = 0; t < firstLoanMonth; t++) expect(funding.months[t]!.loanDraw).toBe(0);
  });

  it('mezzanine draws after equity and before the loan, with its fee at first draw', () => {
    const { funding } = fundingFor({ ...fixtureDeal(), financing: { ...fixtureDeal().financing, mezz: { enabled: true, pctOfCost: 0.1, ratePct: 0.12, feePct: 0.02, repaidAt: 'refi' } } });
    const firstMezz = funding.months.findIndex((m) => m.mezzDraw > 0);
    const firstLoan = funding.months.findIndex((m) => m.loanDraw > 0);
    expect(firstMezz).toBeGreaterThan(0);
    expect(firstLoan).toBeGreaterThanOrEqual(firstMezz);
    expect(funding.mezzFirstDrawMonth).toBe(firstMezz);
    // Fee = 2% of M, charged in the first draw month
    expect(funding.fees.mezz).toBeCloseTo(funding.mezzCommitment * 0.02, 6);
    expect(funding.months[firstMezz]!.costs.financingFees).toBeCloseTo(funding.fees.mezz, 6);
    // Mezz drawn in full: M = 0.1 × TPC
    const drawn = sum(funding.months.map((m) => m.mezzDraw));
    expect(Math.abs(drawn - 0.1 * funding.tpc)).toBeLessThan(1);
    // Mezz interest accrues at 12%/12 on the prior balance
    const t = firstMezz + 1;
    expect(funding.months[t]!.interestMezz).toBeCloseTo((funding.months[t - 1]!.mezzBalance * 0.12) / 12, 6);
    expect(funding.interest.mezz).toBeGreaterThan(0);
  });

  it('a land loan is drawn at month 0, accrues interest, and rolls into the construction loan at P', () => {
    const { funding, tl } = fundingFor({ ...fixtureDeal(), financing: { ...fixtureDeal().financing, landLoan: { enabled: true, ltv: 0.5, ratePct: 0.09, feePct: 0.01 } } });
    // 50% × 3,000,000 = 1,500,000 at month 0; fee 1% = 15,000 at month 0
    expect(funding.months[0]!.landLoanDraw).toBe(1_500_000);
    expect(funding.months[0]!.landLoanBalance).toBe(1_500_000);
    expect(funding.fees.land).toBe(15000);
    expect(funding.months[0]!.costs.financingFees).toBe(15000);
    // month 1 interest: 1,500,000 × 0.09 / 12 = 11,250
    expect(funding.months[1]!.interestLand).toBeCloseTo(11250, 6);
    // Balance at P−1 then rolled at P: the construction loan draw at P includes the land balance
    const balanceBeforeRoll = funding.months[tl.P - 1]!.landLoanBalance;
    const interestAtP = funding.months[tl.P]!.interestLand;
    expect(funding.months[tl.P]!.landLoanBalance).toBe(0);
    expect(funding.months[tl.P]!.loanDraw).toBeGreaterThanOrEqual(balanceBeforeRoll + interestAtP - 1e-6);
    expect(funding.interest.land).toBeCloseTo(sum(funding.months.map((m) => m.interestLand)), 6);
  });

  it('owned land is an in-kind GP contribution at month 0 that counts toward E', () => {
    const { funding } = fundingFor({ ...fixtureDeal(), site: { ...fixtureDeal().site, landOwned: true } });
    expect(funding.months[0]!.equityInKind).toBe(3_000_000);
    expect(funding.equityInKind).toBe(3_000_000);
    // cash equity + in-kind = E
    expect(Math.abs(funding.equityCash + funding.equityInKind - funding.equityCommitment)).toBeLessThan(1);
  });

  it('inflow events reduce the funding requirement, with surplus carried forward (7.5)', () => {
    const base = fundingFor(fixtureDeal());
    const withInflow = fundingFor({
      ...fixtureDeal(),
      events: [{ id: 'sell', label: 'Sell house', month: 2, amount: 100_000, kind: 'inflow', category: 'inflow' }],
    });
    // Month 2 equity call is 100,000 lower (month 2 costs exceed 100,000, so no carry-forward)
    const eq = (f: typeof base, t: number) => f.funding.months[t]!.equityCashGp + f.funding.months[t]!.equityCashLp;
    expect(withInflow.funding.months[2]!.costTotal).toBeGreaterThan(100_000);
    expect(eq(base, 2) - eq(withInflow, 2)).toBeCloseTo(100_000, 6);
    expect(withInflow.funding.inflowsApplied).toBe(100_000);
    expect(withInflow.funding.surplusAtR).toBe(0);

    // A large inflow at a cheap month carries forward across months.
    const big = fundingFor({
      ...simpleDeal(),
      events: [{ id: 'grant', label: 'Grant', month: 1, amount: 250_000, kind: 'inflow', category: 'inflow' }],
    });
    // Simple deal: months 0–5 cost 60,000 each (soft predevelopment). Inflow 250,000 at month 1:
    // month 1 need 60,000 − 250,000 → surplus 190,000; month 2 → 130,000; month 3 → 70,000;
    // month 4 → 10,000; month 5 need 60,000 − 10,000 = 50,000 of equity.
    const m = big.funding.months;
    expect(m[1]!.surplusCarry).toBeCloseTo(190_000, 6);
    expect(m[2]!.surplusCarry).toBeCloseTo(130_000, 6);
    expect(m[4]!.surplusCarry).toBeCloseTo(10_000, 6);
    expect(m[5]!.surplusCarry).toBe(0);
    expect(m[5]!.equityCashGp + m[5]!.equityCashLp).toBeCloseTo(50_000, 6);
    for (let t = 1; t <= 4; t++) expect(m[t]!.equityCashGp + m[t]!.equityCashLp).toBe(0);
    expect(big.funding.inflowsApplied).toBe(250_000);
    // Equity contributed = TPC − inflows
    expect(big.funding.equityCash).toBeCloseTo(3_600_000 - 250_000, 6);
  });

  it('a non-convergent deal throws EngineError("non-convergent") with the last two iterations', () => {
    // 85% leverage at an absurd 5,000% rate makes capitalized interest run away.
    const bad: DealInputsInput = {
      ...fixtureDeal(),
      financing: { ...fixtureDeal().financing, constructionLoan: { ltc: 0.85, ratePct: 50, feePct: 0 } },
    };
    let caught: unknown;
    try {
      fundingFor(bad);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(EngineError);
    const err = caught as EngineError;
    expect(err.code).toBe('non-convergent');
    const details = err.details as { lastIterations: Array<{ tpcIn: number; tpcOut: number }> };
    expect(details.lastIterations).toHaveLength(2);
  });
});

describe('run() diagnostics', () => {
  it('reports the iteration count and engine version', () => {
    const out = run(fixtureDeal());
    expect(out.diagnostics.iterations).toBeGreaterThan(0);
    expect(out.diagnostics.engineVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('rejects invalid inputs with EngineError("invalid-inputs")', () => {
    expect(() => run({ ...fixtureDeal(), meta: { ...fixtureDeal().meta, holdMonths: 12 } })).toThrow(EngineError);
    try {
      run({ ...fixtureDeal(), meta: { ...fixtureDeal().meta, holdMonths: 12 } });
    } catch (e) {
      expect((e as EngineError).code).toBe('invalid-inputs');
    }
  });

  it('accepts an already-parsed DealInputs object', () => {
    const inputs = fixtureInputs();
    expect(run(inputs).totals.tpc).toBeCloseTo(run(fixtureDeal()).totals.tpc, 6);
  });
});
