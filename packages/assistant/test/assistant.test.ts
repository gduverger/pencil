import { describe, expect, it } from 'vitest';
import { parseInputs, run, explain, inputCatalog } from '@pencil/engine';
import { FakeProvider } from '../src/fake';
import { BudgetExceededError, deterministicFlagSentence, draftNarrative, explainNumber, flagSentence, intakeTurn, type IntakeInput } from '../src/assistant';
import type { Budget } from '../src/provider';

const twelve: IntakeInput[] = inputCatalog()
  .filter((e) => e.star)
  .map((e) => ({ path: e.path, label: e.label, unit: e.unit, value: e.default, source: 'unknown', benchmark: null }));

describe('10.1 guided intake with a recorded conversation', () => {
  it('fills a deal end to end from scripted tool calls; the user confirms before anything is written', async () => {
    const provider = new FakeProvider([
      {
        text: 'Thanks. I have the address and construction type. Here is what I propose for the inputs you gave me; confirm each one.',
        toolCalls: [
          { id: 't1', name: 'setInput', input: { path: 'program.totalUnits', value: 60, source: 'my-number', note: 'Target program from the user' } },
          { id: 't2', name: 'setInput', input: { path: 'site.landCost', value: 3000000, source: 'my-number', note: 'LOI price stated by the user' } },
          { id: 't3', name: 'setInput', input: { path: 'site.landOwned', value: false, source: 'my-number', note: 'Not owned' } },
          { id: 't4', name: 'setInput', input: { path: 'costs.hard.perGrossSF', value: 320, source: 'quote', note: 'GC budget quoted by the user' } },
          { id: 't5', name: 'setInput', input: { path: 'meta.holdMonths', value: 120, source: 'my-number', note: 'Ten-year hold' } },
          { id: 't6', name: 'setInput', input: { path: 'bogus.path', value: 1, source: 'my-number', note: '' } },
        ],
      },
    ]);
    const turn = await intakeTurn(
      { provider, orgId: 'org-1' },
      {
        inputs: twelve,
        setup: { address: '120 Highland Avenue, Needham, MA', town: 'Needham', townCluster: 'inner-suburbs', constructionType: 'wood-frame' },
        transcript: [{ role: 'assistant', text: 'What is the address, and is the land owned?' }],
        userText: '120 Highland Ave in Needham, 60 units wood frame, we have an LOI at $3,000,000, not owned, GC says $320/SF, ten-year hold.',
      },
    );
    expect(turn.proposals).toHaveLength(5);
    expect(turn.rejected).toHaveLength(1);
    expect(turn.warning).toBeNull();
    // The request carried the engine data and the setInput tool, and nothing else wrote to the deal.
    const req = provider.requests[0]!;
    expect(req.tools?.[0]?.name).toBe('setInput');
    expect(req.messages[0]!.content[0]).toMatchObject({ type: 'text' });
    // Applying the confirmed proposals yields a deal the engine runs.
    let doc: Record<string, unknown> = {};
    const { setPath } = await import('@pencil/engine');
    for (const p of turn.proposals) doc = setPath(doc, p.path, p.value);
    const inputs = parseInputs(doc);
    expect(inputs.program.totalUnits).toBe(60);
    expect(inputs.site.landCost).toBe(3_000_000);
    expect(inputs.costs.hard.perGrossSF).toBe(320);
    expect(run(inputs).totals.tpc).toBeGreaterThan(0);
  });

  it('warns when the reply mentions a number that is neither in the data nor in the user message', async () => {
    const provider = new FakeProvider([{ text: 'Most Needham deals cost $999,999 per unit.', toolCalls: [] }]);
    const turn = await intakeTurn({ provider, orgId: 'org-1' }, { inputs: twelve, setup: { address: '', town: null, townCluster: null, constructionType: 'wood-frame' }, transcript: [], userText: 'hello' });
    expect(turn.warning).toContain('$999,999');
  });
});

describe('10.2 explain, 10.3 flags, 10.4 narrative with the post-check', () => {
  const out = run(parseInputs({ program: { totalUnits: 60 }, site: { landCost: 3_000_000 } }));
  const trace = explain(out, 'metrics.yieldOnCost');
  const inputs = [{ path: 'costs.hard.perGrossSF', label: 'Hard cost per gross SF', value: 350, source: 'quote', note: 'GC budget' }];

  it('accepts an explanation whose numbers all come from the trace', async () => {
    const noi = trace.operands.find((o) => o.ref === 'metrics.stabilizedNoi')!.value as number;
    const tpc = trace.operands.find((o) => o.ref === 'totals.tpc')!.value as number;
    const provider = new FakeProvider([{ text: `Yield on cost divides the first twelve months of stabilized NOI, $${Math.round(noi).toLocaleString('en-US')}, by the total project cost of $${Math.round(tpc / 1000) * 1000} to give ${(trace.value as number * 100).toFixed(2)}%. Hard cost is the largest driver.` }]);
    const r = await explainNumber({ provider, orgId: 'o' }, { trace, inputs });
    expect(r.warning).toBeNull();
    expect(r.attempts).toBe(1);
  });

  it('rejects a fabricated number, regenerates once, then shows the second answer with a warning if it is still wrong', async () => {
    const provider = new FakeProvider([{ text: 'Yield on cost is 9.9% here.' }, { text: 'Yield on cost is 8.8%, honestly.' }]);
    const r = await explainNumber({ provider, orgId: 'o' }, { trace, inputs });
    expect(r.attempts).toBe(2);
    expect(r.warning).toContain('8.8%');
    expect(provider.requests[1]!.messages).toHaveLength(3);
    expect((provider.requests[1]!.messages[2]!.content[0] as { text: string }).text).toContain('9.9%');
    // A clean second answer passes without a warning.
    const good = new FakeProvider([{ text: 'It is 9.9%.' }, { text: `It is ${(trace.value as number * 100).toFixed(2)}%.` }]);
    const r2 = await explainNumber({ provider: good, orgId: 'o' }, { trace, inputs });
    expect(r2.attempts).toBe(2);
    expect(r2.warning).toBeNull();
  });

  it('turns a flag into one sentence with the comparison stated, with a deterministic fallback', async () => {
    const flag = { code: 'outside-benchmark', message: 'x', path: 'program.unitTypes[2BR].rentPerMonth', label: '2BR rent', value: 3400, unit: 'usd_per_unit_month', benchmark: { low: 2700, high: 3200, asOf: 'Q3 2026', segment: 'inner suburbs', source: 'Mark' } };
    expect(deterministicFlagSentence(flag)).toBe('Your 2br rent of $3,400 is above the $2,700–$3,200 range for inner suburbs as of Q3 2026.');
    const provider = new FakeProvider([{ text: 'Your 2BR rent of $3,400 is above the $2,700–$3,200 range for inner suburbs as of Q3 2026.' }]);
    const r = await flagSentence({ provider, orgId: 'o' }, flag);
    expect(r.warning).toBeNull();
    expect(deterministicFlagSentence({ code: 'refinance-shortfall', message: 'the permanent loan does not repay the construction loan' })).toMatch(/\.$/);
  });

  it('drafts a narrative that states ranges from the register and metrics', async () => {
    const args = {
      dealName: 'Needham 60',
      site: { address: '120 Highland Ave', town: 'Needham' },
      program: { totalUnits: 60, gsfTotal: 56824, mix: '6 studio, 24 1BR, 24 2BR, 6 3BR' },
      register: [{ label: 'Hard cost per gross SF', value: 320, unit: 'usd_per_sf', source: 'quote', note: 'GC budget' }],
      metrics: { likely: { projectIrr: 0.112, yieldOnCost: 0.0601 }, best: { projectIrr: 0.164, yieldOnCost: 0.0699 }, worst: { projectIrr: 0.067, yieldOnCost: 0.0518 } },
    };
    const provider = new FakeProvider([{ text: 'Needham 60 is a 60-unit wood-frame rental building in Needham. Hard cost is $320 per gross SF from the GC budget. The project IRR ranges 6.7% to 16.4% across the scenarios with a yield on cost of 5.18% to 6.99%.' }]);
    const r = await draftNarrative({ provider, orgId: 'o' }, args);
    expect(r.warning).toBeNull();
    expect(r.text).toContain('6.7%');
  });

  it('enforces the organization budget', async () => {
    const budget: Budget = { allow: async () => false, record: async () => undefined };
    const provider = new FakeProvider([{ text: 'x' }]);
    await expect(flagSentence({ provider, budget, orgId: 'o' }, { code: 'c', message: 'm' })).rejects.toThrow(BudgetExceededError);
    expect(provider.requests).toHaveLength(0);
  });
});
