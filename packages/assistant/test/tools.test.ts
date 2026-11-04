import { describe, expect, it } from 'vitest';
import { setInputTool, validateSetInputCalls } from '../src/tools';

describe('10.1 / 10.5 setInput tool validation', () => {
  it('describes every input path and requires path, value, source and note', () => {
    const tool = setInputTool();
    expect(tool.name).toBe('setInput');
    expect(tool.description).toContain('costs.hard.perGrossSF');
    expect((tool.inputSchema as { required: string[] }).required).toEqual(['path', 'value', 'source', 'note']);
    expect((tool.inputSchema as { properties: { source: { enum: string[] } } }).properties.source.enum).not.toContain('calculated');
  });

  it('accepts known paths with the right value types and never a calculated source', () => {
    const r = validateSetInputCalls([
      { name: 'setInput', input: { path: 'costs.hard.perGrossSF', value: '320', source: 'quote', note: 'GC budget' } },
      { name: 'setInput', input: { path: 'site.landOwned', value: 'yes', source: 'my-number', note: '' } },
      { name: 'setInput', input: { path: 'financing.constructionLoan.ltc', value: 65, source: 'calculated', note: 'lender term sheet' } },
      { name: 'setInput', input: { path: 'meta.name', value: 'Needham 60', source: 'my-number', note: '' } },
      { name: 'setInput', input: { path: 'nope.path', value: 1, source: 'my-number', note: '' } },
      { name: 'setInput', input: { path: 'program.totalUnits', value: 'sixty', source: 'my-number', note: '' } },
      { name: 'other', input: {} },
      { name: 'setInput', input: null },
    ]);
    expect(r.accepted).toEqual([
      { path: 'costs.hard.perGrossSF', value: 320, source: 'quote', note: 'GC budget' },
      { path: 'site.landOwned', value: true, source: 'my-number', note: '' },
      { path: 'financing.constructionLoan.ltc', value: 0.65, source: 'my-number', note: 'lender term sheet' },
      { path: 'meta.name', value: 'Needham 60', source: 'my-number', note: '' },
    ]);
    expect(r.rejected.map((x) => x.reason)).toEqual(['unknown input path nope.path', 'program.totalUnits needs a number', 'unknown tool other', 'missing path']);
  });
});
