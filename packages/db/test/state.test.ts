import { describe, expect, it } from 'vitest';
import { run } from '@pencil/engine';
import { addChild, applyPatches, cloneHistory, cloneState, deleteChild, deleteEvent, elaboratedParentDisplayValue, elaborationParentAmount, markStale, saveSensitivity, setSwitch, StateError, toDealInputs, tonightPaths, updateChild, upsertEvent, visibleInputPaths } from '../src/state';
import { freshState, NOW } from './helpers';

describe('deal state → engine inputs', () => {
  it('builds engine inputs from the stored records, switches and events', () => {
    const state = freshState();
    const inputs = toDealInputs(state);
    expect(inputs.site.landCost).toBe(3_000_000);
    expect(inputs.meta.name).toBe('Test deal');
    expect(inputs.financing.permanent.enabled).toBe(true);
    expect(inputs.program.commercial.enabled).toBe(false);
    expect(run(inputs).totals.tpc).toBeGreaterThan(0);
    expect(tonightPaths()).toContain('costs.hard.perGrossSF');
    expect(visibleInputPaths(state)).not.toContain('program.commercial.grossSF');
  });

  it('FR-1.2: every change to value, source or note appends the prior state to history', () => {
    const s0 = freshState();
    const r1 = applyPatches(s0, [{ scenario: 'likely', path: 'costs.hard.perGrossSF', value: 320, source: 'quote', note: 'GC budget' }], 'bob', NOW);
    expect(r1.history).toHaveLength(1);
    expect(r1.history[0]).toMatchObject({ path: 'costs.hard.perGrossSF', priorValue: 350, priorSource: 'unknown', changedBy: 'bob' });
    expect(r1.state.inputs['costs.hard.perGrossSF']).toMatchObject({ value: 320, source: 'quote', note: 'GC budget', updatedBy: 'bob' });
    // a note-only change still appends
    const r2 = applyPatches(r1.state, [{ scenario: 'likely', path: 'costs.hard.perGrossSF', note: 'GC budget, revised' }], 'bob', NOW);
    expect(r2.history).toHaveLength(1);
    expect(r2.history[0]!.priorNote).toBe('GC budget');
    // an identical patch appends nothing
    const r3 = applyPatches(r2.state, [{ scenario: 'likely', path: 'costs.hard.perGrossSF', value: 320 }], 'bob', NOW);
    expect(r3.history).toHaveLength(0);
    // numbers typed as strings are coerced (FR-1.4)
    const r4 = applyPatches(r3.state, [{ scenario: 'likely', path: 'program.totalUnits', value: '72' }], 'bob', NOW);
    expect(r4.state.inputs['program.totalUnits']!.value).toBe(72);
    expect(() => applyPatches(s0, [{ scenario: 'likely', path: 'financing.permanent.enabled', value: false }], 'bob', NOW)).toThrow(StateError);
  });

  it('FR-5: Best and Worst overrides inherit Likely and can be cleared', () => {
    const s0 = freshState();
    const r1 = applyPatches(s0, [{ scenario: 'best', path: 'exit.exitCapRatePct', value: 0.05 }], 'bob', NOW);
    expect(toDealInputs(r1.state, 'best').exit.exitCapRatePct).toBe(0.05);
    expect(toDealInputs(r1.state, 'likely').exit.exitCapRatePct).toBe(0.055);
    expect(toDealInputs(r1.state, 'worst').exit.exitCapRatePct).toBe(0.055);
    const r2 = applyPatches(r1.state, [{ scenario: 'best', path: 'exit.exitCapRatePct', clear: true }], 'bob', NOW);
    expect(r2.state.scenarios.best['exit.exitCapRatePct']).toBeUndefined();
    expect(r2.history[0]!.priorValue).toBe(0.05);
    expect(() => applyPatches(s0, [{ scenario: 'worst', path: 'exit.exitCapRatePct' }], 'bob', NOW)).toThrow(StateError);
  });

  it('FR-2: the first child creates a remainder so totals do not jump; children sum to the parent', () => {
    const s0 = freshState();
    const parentBefore = elaborationParentAmount(s0, 'costs.hard.perGrossSF');
    const tpcBefore = run(toDealInputs(s0)).totals.tpc;
    const r1 = addChild(s0, 'costs.hard.perGrossSF', { label: 'Sitework', amount: 2_000_000, source: 'quote' }, 'bob', NOW);
    const children = r1.state.elaboration['costs.hard.perGrossSF']!;
    expect(children).toHaveLength(2);
    expect(children[1]!.remainder).toBe(true);
    expect(children[0]!.amount + children[1]!.amount).toBeCloseTo(parentBefore, 6);
    expect(run(toDealInputs(r1.state)).totals.tpc).toBeCloseTo(tpcBefore, 3);
    expect(r1.history).toHaveLength(2);
    // parent is read-only and shows the derived $/SF
    expect(() => applyPatches(r1.state, [{ scenario: 'likely', path: 'costs.hard.perGrossSF', value: 999 }], 'bob', NOW)).toThrow(StateError);
    expect(elaboratedParentDisplayValue(r1.state, 'costs.hard.perGrossSF')).toBeCloseTo(350, 6);
    // adding a second child rebalances the remainder
    const r2 = addChild(r1.state, 'costs.hard.perGrossSF', { label: 'Structure', amount: 10_000_000 }, 'bob', NOW);
    const c2 = r2.state.elaboration['costs.hard.perGrossSF']!;
    expect(c2.reduce((s, c) => s + c.amount, 0)).toBeCloseTo(parentBefore, 6);
    // editing the remainder's amount makes it a normal line; editing another line rebalances a live remainder
    const r3 = updateChild(r2.state, 'costs.hard.perGrossSF', c2[0]!.id, { amount: 2_500_000 }, 'bob', NOW);
    expect(r3.state.elaboration['costs.hard.perGrossSF']!.reduce((s, c) => s + c.amount, 0)).toBeCloseTo(parentBefore, 6);
    // deleting the remainder changes the total
    const rem = r3.state.elaboration['costs.hard.perGrossSF']!.find((c) => c.remainder)!;
    const r4 = deleteChild(r3.state, 'costs.hard.perGrossSF', rem.id, 'bob', NOW);
    expect(r4.state.elaboration['costs.hard.perGrossSF']).toHaveLength(2);
    expect(run(toDealInputs(r4.state)).totals.byCategory.hard).toBeCloseTo(12_500_000, 3);
    // deleting all children returns the parent to an editable value (FR-2.4)
    const ids = r4.state.elaboration['costs.hard.perGrossSF']!.map((c) => c.id);
    let s = r4.state;
    for (const id of ids) s = deleteChild(s, 'costs.hard.perGrossSF', id, 'bob', NOW).state;
    expect(s.elaboration['costs.hard.perGrossSF']).toBeUndefined();
    expect(s.inputs['costs.hard.perGrossSF']!.source).toBe('calculated');
    // the parent keeps the last elaborated total (the one remaining line was 10,000,000) so outputs do not jump
    expect(run(toDealInputs(s)).totals.byCategory.hard).toBeCloseTo(10_000_000, 3);
  });

  it('elaborates an opex per-unit line into children that sum to it', () => {
    const s0 = freshState();
    const r1 = addChild(s0, 'operations.opex.payrollPerUnit', { label: 'Manager', amount: 800 }, 'bob', NOW);
    const children = r1.state.elaboration['operations.opex.payrollPerUnit']!;
    expect(children[1]!.amount).toBe(400); // 1,200 default − 800
    expect(toDealInputs(r1.state).operations.opex.payrollPerUnit).toBe(1200);
    const r2 = updateChild(r1.state, 'operations.opex.payrollPerUnit', children[1]!.id, { amount: 500 }, 'bob', NOW);
    expect(toDealInputs(r2.state).operations.opex.payrollPerUnit).toBe(1300);
    expect(() => addChild(s0, 'meta.name', { label: 'x', amount: 1 }, 'bob', NOW)).toThrow(StateError);
  });

  it('FR-3: switches reveal inputs, exclude them from the math when off, and keep hidden values', () => {
    const s0 = freshState();
    const on = setSwitch(s0, 'commercial', true, 'bob', NOW, { 'program.commercial.grossSF': { value: 4000, source: 'my-number' } });
    expect(toDealInputs(on.state).program.commercial.enabled).toBe(true);
    expect(toDealInputs(on.state).program.commercial.grossSF).toBe(4000);
    expect(visibleInputPaths(on.state)).toContain('program.commercial.grossSF');
    const off = setSwitch(on.state, 'commercial', false, 'bob', NOW);
    expect(toDealInputs(off.state).program.commercial.enabled).toBe(false);
    expect(off.state.inputs['program.commercial.grossSF']!.value).toBe(4000); // retained
    expect(run(toDealInputs(off.state)).program.commercialSF).toBe(0);
    expect(() => setSwitch(s0, 'constructionInterestOnly', false, 'bob', NOW)).toThrow(StateError);
  });

  it('FR-4: events are first-class, with history, and inflows force the inflow category', () => {
    const s0 = freshState();
    const r1 = upsertEvent(s0, { label: 'Sell relocated house', month: 24, amount: 400_000, kind: 'inflow', category: 'other' }, 'bob', NOW);
    expect(r1.state.events[0]!.category).toBe('inflow');
    expect(toDealInputs(r1.state).events).toHaveLength(1);
    const r2 = upsertEvent(r1.state, { id: r1.state.events[0]!.id, label: 'Sell relocated house', month: 25, amount: 450_000, kind: 'inflow', category: 'inflow' }, 'bob', NOW);
    expect(r2.state.events).toHaveLength(1);
    expect(r2.history[0]!.priorValue).toMatchObject({ amount: 400_000 });
    const r3 = deleteEvent(r2.state, r2.state.events[0]!.id, 'bob', NOW);
    expect(r3.state.events).toHaveLength(0);
    expect(() => deleteEvent(s0, 'nope', 'bob', NOW)).toThrow(StateError);
  });

  it('FR-6.2: saved sensitivities go stale on any input change', () => {
    const s0 = freshState();
    const saved = saveSensitivity(s0, { key: 'k', label: 'Grid', scenario: 'likely', axisA: { path: 'a', values: [1] }, axisB: { path: 'b', values: [1] }, metrics: ['projectIrr'], grid: { scenario: {}, axisA: { path: 'a', values: [1] }, axisB: { path: 'b', values: [1] }, metrics: ['projectIrr'], rows: [], base: { a: null, b: null }, errors: 0 }, ranAt: NOW, ranBy: 'bob' });
    expect(saved.sensitivities[0]!.stale).toBe(false);
    const changed = applyPatches(saved, [{ scenario: 'likely', path: 'site.landCost', value: 3_100_000 }], 'bob', NOW).state;
    expect(changed.sensitivities[0]!.stale).toBe(true);
    expect(markStale(changed)).toBe(changed);
  });

  it('cloning keeps inputs, elaboration, events, switches and scenarios and resets history to one row per input', () => {
    const s0 = applyPatches(freshState(), [{ scenario: 'best', path: 'exit.exitCapRatePct', value: 0.05 }], 'bob', NOW).state;
    const withEvent = upsertEvent(s0, { label: 'Grant', month: 1, amount: 100_000, kind: 'inflow', category: 'inflow' }, 'bob', NOW).state;
    const cloned = cloneState(withEvent, 'Original', 'carol', NOW);
    expect(cloned.events).toHaveLength(1);
    expect(cloned.scenarios.best['exit.exitCapRatePct']!.value).toBe(0.05);
    expect(cloned.inputs['site.landCost']!.note).toContain('cloned from Original');
    expect(cloned.inputs['site.landCost']!.updatedBy).toBe('carol');
    const rows = cloneHistory(cloned, 'Original', 'carol', NOW);
    expect(rows.length).toBe(Object.keys(cloned.inputs).length);
    expect(rows[0]!.priorNote).toBe('cloned from Original');
  });
});
