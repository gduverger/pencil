import { describe, expect, it } from 'vitest';
import { buildCostSchedule, softDefaultSchedule } from '../src/costs';
import { computeProgram } from '../src/program';
import { parseInputs } from '../src/schema';
import { buildTimeline } from '../src/timeline';
import { scurveWeights } from '../src/math';
import { fixtureInputs, simpleDeal } from './fixtures';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('7.4 capitalized costs and distributions', () => {
  it('soft cost split: predevShare straight-line over [0, P), remainder over [P, O)', () => {
    // SC = 600,000, predevShare 0.6, P = 6, C = 12
    // predevelopment months 0–5: 600,000 × 0.6 / 6 = 60,000 each
    // construction months 6–17: 600,000 × 0.4 / 12 = 20,000 each
    const tl = { P: 6, O: 18, Z: 18, R: 18, S: 60, permanentEnabled: false };
    const s = softDefaultSchedule(600000, 0.6, tl, 61);
    for (let t = 0; t < 6; t++) expect(s[t]).toBeCloseTo(60000, 6);
    for (let t = 6; t < 18; t++) expect(s[t]).toBeCloseTo(20000, 6);
    expect(sum(s)).toBeCloseTo(600000, 6);
    expect(s[18]).toBe(0);
  });

  it('P = 0 puts all soft cost in the construction window', () => {
    // 600,000 / 12 = 50,000 per month over months 0–11
    const tl = { P: 0, O: 12, Z: 12, R: 12, S: 60, permanentEnabled: false };
    const s = softDefaultSchedule(600000, 0.6, tl, 61);
    for (let t = 0; t < 12; t++) expect(s[t]).toBeCloseTo(50000, 6);
    expect(sum(s)).toBeCloseTo(600000, 6);
  });

  it('builds every line of the 7.4 table for the simple deal', () => {
    const inputs = parseInputs(simpleDeal());
    const tl = buildTimeline(inputs);
    const program = computeProgram(inputs);
    const cs = buildCostSchedule(inputs, program, tl);
    // H = 300 × 10,000 = 3,000,000 straight-line over months 6–17 → 250,000 each
    expect(cs.hardTotal).toBeCloseTo(3_000_000, 6);
    for (let t = 6; t < 18; t++) expect(cs.byCategory.hard[t]).toBeCloseTo(250000, 6);
    expect(cs.byCategory.hard[5]).toBe(0);
    // SC = 3,000,000 × 0.2 = 600,000
    expect(cs.softTotal).toBeCloseTo(600000, 6);
    expect(sum(cs.byCategory.soft)).toBeCloseTo(600000, 6);
    expect(sum(cs.byCategory.land)).toBe(0);
  });

  it('uses the S-curve over [P, O) for hard cost and the same curve for the contingency', () => {
    const inputs = fixtureInputs();
    const tl = buildTimeline(inputs);
    const program = computeProgram(inputs);
    const cs = buildCostSchedule(inputs, program, tl);
    // H = 300 × 56,823.53 = 17,047,058.82
    const H = 300 * program.gsfTotal;
    expect(cs.hardTotal).toBeCloseTo(H, 3);
    const w = scurveWeights(18);
    for (let k = 0; k < 18; k++) {
      expect(cs.byCategory.hard[12 + k]).toBeCloseTo(H * w[k]!, 3);
      // contingency 5% follows the same curve
      expect(cs.byCategory.hardContingency[12 + k]).toBeCloseTo(H * 0.05 * w[k]!, 3);
    }
    expect(cs.byCategory.hard[11]).toBe(0);
    expect(cs.byCategory.hard[30]).toBe(0);
  });

  it('places land and closing at month 0, carry in its windows, developer fee over [0, O)', () => {
    const inputs = fixtureInputs();
    const tl = buildTimeline(inputs);
    const program = computeProgram(inputs);
    const cs = buildCostSchedule(inputs, program, tl);
    expect(cs.byCategory.land[0]).toBe(3_000_000);
    expect(sum(cs.byCategory.land)).toBe(3_000_000);
    // closing 2% = 60,000 at month 0
    expect(cs.byCategory.closing[0]).toBeCloseTo(60000, 6);
    // taxes 60,000 / 12 = 5,000 each month in [0, 30); insurance 40,000 / 12 = 3,333.33 in [12, 30)
    expect(cs.byCategory.carryTaxes[0]).toBeCloseTo(5000, 6);
    expect(cs.byCategory.carryTaxes[29]).toBeCloseTo(5000, 6);
    expect(cs.byCategory.carryTaxes[30]).toBe(0);
    expect(cs.byCategory.carryInsurance[11]).toBe(0);
    expect(cs.byCategory.carryInsurance[12]).toBeCloseTo(40000 / 12, 6);
    expect(cs.byCategory.carryInsurance[29]).toBeCloseTo(40000 / 12, 6);
    expect(cs.byCategory.carryInsurance[30]).toBe(0);
    // developer fee 3% of (H + SC) straight-line over 30 months
    const H = cs.hardTotal;
    const SC = cs.softTotal;
    expect(SC).toBeCloseTo(H * 0.25, 3);
    const fee = (H + SC) * 0.03;
    expect(sum(cs.byCategory.developerFee)).toBeCloseTo(fee, 3);
    expect(cs.byCategory.developerFee[0]).toBeCloseTo(fee / 30, 3);
    expect(cs.byCategory.developerFee[29]).toBeCloseTo(fee / 30, 3);
    expect(cs.byCategory.developerFee[30]).toBe(0);
  });

  it('places commercial TI at month O when commercial is on', () => {
    const inputs = fixtureInputs((d) => ({
      ...d,
      program: { ...d.program!, commercial: { enabled: true, grossSF: 4000, tiPerSF: 60 } },
    }));
    const tl = buildTimeline(inputs);
    const cs = buildCostSchedule(inputs, computeProgram(inputs), tl);
    // 4,000 × 60 = 240,000 at month O = 30
    expect(cs.byCategory.commercialTI[30]).toBe(240000);
    expect(sum(cs.byCategory.commercialTI)).toBe(240000);
  });

  it('elaborated hard-cost lines sum to the parent and keep their own distributions', () => {
    const inputs = fixtureInputs((d) => ({
      ...d,
      costs: {
        ...d.costs!,
        hard: {
          perGrossSF: 999, // ignored when lines are present
          contingencyPct: 0.1,
          lines: [
            { label: 'Sitework', amount: 2_000_000, distribution: { kind: 'straight' } },
            { label: 'Structure', amount: 10_000_000 },
            {
              label: 'Finishes',
              amount: 6_000_000,
              distribution: { kind: 'custom', weights: [...new Array(17).fill(0), 1] },
            },
          ],
        },
      },
    }));
    const tl = buildTimeline(inputs);
    const cs = buildCostSchedule(inputs, computeProgram(inputs), tl);
    expect(cs.hardTotal).toBe(18_000_000);
    const hard = cs.lines.find((l) => l.key === 'hard')!;
    expect(hard.children).toHaveLength(3);
    // Sitework straight-line: 2,000,000 / 18 = 111,111.11 per month over months 12–29
    expect(hard.children![0]!.monthly[12]).toBeCloseTo(2_000_000 / 18, 6);
    // Finishes entirely in the last construction month (29)
    expect(hard.children![2]!.monthly[29]).toBe(6_000_000);
    expect(hard.children![2]!.monthly[28]).toBe(0);
    // Contingency 10% of 18,000,000 = 1,800,000 following the aggregate profile
    expect(sum(cs.byCategory.hardContingency)).toBeCloseTo(1_800_000, 3);
    expect(cs.byCategory.hardContingency[29]! / 1_800_000).toBeCloseTo(
      cs.byCategory.hard[29]! / 18_000_000,
      9,
    );
  });
});

describe('7.5 events', () => {
  it('cost events are their own lines in their month; inflow events are sources', () => {
    const inputs = fixtureInputs((d) => ({
      ...d,
      events: [
        {
          id: 'relocate',
          label: 'Relocate historic house',
          month: 14,
          amount: 150000,
          kind: 'cost',
          category: 'hard',
        },
        {
          id: 'sell-house',
          label: 'Sell historic house',
          month: 20,
          amount: 400000,
          kind: 'inflow',
          category: 'inflow',
        },
      ],
    }));
    const tl = buildTimeline(inputs);
    const cs = buildCostSchedule(inputs, computeProgram(inputs), tl);
    expect(cs.byCategory.events[14]).toBe(150000);
    expect(sum(cs.byCategory.events)).toBe(150000);
    expect(cs.inflows[20]).toBe(400000);
    expect(cs.inflowLines.map((l) => l.label)).toEqual(['Sell historic house']);
    expect(cs.lines.find((l) => l.key === 'event:relocate')?.label).toBe('Relocate historic house');
  });
});

describe('7.4 elaborated soft-cost lines', () => {
  it('soft lines sum to the parent; a line with its own distribution spreads over [0, O)', () => {
    const inputs = fixtureInputs((d) => ({
      ...d,
      costs: {
        ...d.costs!,
        soft: {
          pctOfHard: 0.99, // ignored when lines are present
          contingencyPct: 0.05,
          predevShare: 0.6,
          lines: [
            { label: 'Architecture', amount: 1_200_000 },
            {
              label: 'Permits',
              amount: 300_000,
              distribution: { kind: 'custom', weights: [1, ...new Array(29).fill(0)] },
            },
          ],
        },
      },
    }));
    const tl = buildTimeline(inputs);
    const cs = buildCostSchedule(inputs, computeProgram(inputs), tl);
    expect(cs.softTotal).toBe(1_500_000);
    const soft = cs.lines.find((l) => l.key === 'soft')!;
    expect(soft.children).toHaveLength(2);
    // Architecture follows the default split: 60% over months 0–11 → 60,000 per month
    expect(soft.children![0]!.monthly[0]).toBeCloseTo((1_200_000 * 0.6) / 12, 6);
    // Permits entirely at month 0
    expect(soft.children![1]!.monthly[0]).toBe(300_000);
    expect(sum(cs.byCategory.soft)).toBeCloseTo(1_500_000, 6);
    // Contingency 5% of 1,500,000 = 75,000
    expect(sum(cs.byCategory.softContingency)).toBeCloseTo(75_000, 6);
  });

  it('rejects a construction window shorter than one month', () => {
    expect(() =>
      parseInputs({
        ...simpleDeal(),
        timeline: { predevMonths: 6, constructionMonths: 0, leaseUpMonths: 0 },
      }),
    ).toThrow();
  });
});
