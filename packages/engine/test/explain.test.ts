import { describe, expect, it } from 'vitest';
import { run } from '../src/run';
import { explain, explainableCells } from '../src/explain';
import { fixtureDeal } from './fixtures';

describe('10.2 explain(outputs, cellRef)', () => {
  const out = run(fixtureDeal());

  it('returns the formula and operands behind yield on cost, and the operands reproduce the value', () => {
    const trace = explain(out, 'metrics.yieldOnCost');
    expect(trace.formula).toContain('NOI');
    const noi = trace.operands.find((op) => op.ref === 'metrics.stabilizedNoi')!.value as number;
    const tpc = trace.operands.find((op) => op.ref === 'totals.tpc')!.value as number;
    expect(trace.value).toBeCloseTo(noi / tpc, 12);
    expect(trace.unit).toBe('rate_pct');
  });

  it('explains every catalogued cell without throwing and with a finite or null value', () => {
    for (const ref of explainableCells()) {
      const trace = explain(out, ref);
      expect(trace.cellRef).toBe(ref);
      expect(trace.label.length).toBeGreaterThan(0);
      if (typeof trace.value === 'number') expect(Number.isFinite(trace.value)).toBe(true);
    }
  });

  it('explains monthly, annual and unit-type cells by pattern', () => {
    const noi = explain(out, 'months[60].noi');
    expect(noi.value).toBeCloseTo(out.months[60]!.noi, 9);
    expect(noi.operands.map((o) => o.ref)).toContain('months[60].egi');
    const egi = explain(out, 'months[60].egi');
    expect(egi.value).toBeCloseTo(out.months[60]!.egi, 9);
    for (const f of ['gpr', 'occupancy', 'opexTotal', 'interest', 'loanBalance', 'cashFlowAfterDebt']) {
      expect(explain(out, `months[20].${f}`).cellRef).toBe(`months[20].${f}`);
    }
    const dscr = explain(out, 'annual[4].dscr');
    expect(dscr.value).toBeCloseTo(out.annual[4]!.dscr!, 12);
    for (const f of ['noi', 'egi', 'cashOnCash', 'cashFlow']) expect(explain(out, `annual[4].${f}`).value).not.toBeUndefined();
    expect(explain(out, 'annual[0].dscr').notes[0]).toContain('No debt service');
    const units = explain(out, 'program.unitTypes[2BR].units');
    expect(units.value).toBe(24);
  });

  it('falls back to the raw value for cells without a derivation and reports unknown cells', () => {
    const t = explain(out, 'timeline.S');
    expect(t.value).toBe(120);
    expect(t.formula).toBe('value');
    const nothing = explain(out, 'nothing.here');
    expect(nothing.value).toBeNull();
    expect(nothing.notes[0]).toContain('No such cell');
    expect(explain(out, 'months[999].noi').notes[0]).toContain('No such cell');
    expect(explain(out, 'program.unitTypes[4BR].units').notes[0]).toContain('No such cell');
    expect(explain(out, 'annual[99].noi').notes[0]).toContain('No such cell');
    expect(explain(out, 'timeline').formula).toBe('value');
  });

  it('explains refinance and sale cells, including the no-permanent-loan case and notes on shortfalls', () => {
    const d = fixtureDeal();
    const noPerm = run({ ...d, financing: { ...d.financing, permanent: { ...d.financing!.permanent, enabled: false } } });
    expect(explain(noPerm, 'refinance.loan').notes[0]).toContain('switch is off');
    expect(explain(noPerm, 'refinance.net').formula).toBe('value');
    const short = run({ ...d, site: { ...d.site, landCost: 4_000_000 }, costs: { ...d.costs, hard: { perGrossSF: 350 } } });
    expect(explain(short, 'refinance.net').notes[0]).toContain('shortfall');
    const bad = run({ ...d, exit: { ...d.exit, exitCapRatePct: 0.5 } });
    expect(explain(bad, 'sale.netToEquity').notes[0]).toContain('Negative');
    expect(explain(bad, 'metrics.projectIrr').notes[0]).toContain('undefined');
  });
});
