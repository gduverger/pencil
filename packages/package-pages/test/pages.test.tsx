import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE_VERSION, runScenarios, scenarioOverridesFromDeltas, sensitivity, sensitivityPresets } from '@pencil/engine';
import { DEFAULT_PACKAGE_SETTINGS, PAGE_KEYS, packageFileName, planPages, registerFromInputs, roundUsd, type PackageProps } from '../src/index';
import { renderPackageHtml } from '../src/render';

const example = join(__dirname, '..', '..', '..', 'apps', 'cli', 'examples', 'needham-60.json');

function props(overrides: Partial<PackageProps['settings']> = {}): PackageProps {
  const raw = JSON.parse(readFileSync(example, 'utf8')) as unknown;
  const outputs = runScenarios(raw, scenarioOverridesFromDeltas(raw));
  const preset = sensitivityPresets(raw)[0]!;
  return {
    outputs,
    version: { dealName: 'Needham 60', versionNumber: 2, versionDate: '2026-11-04', engineVersion: ENGINE_VERSION },
    register: registerFromInputs(outputs, { source: 'my-number', updatedAt: '2026-11-04' }),
    sensitivities: [
      { key: preset.key, label: preset.label, scenario: 'likely', stale: false, grid: sensitivity(raw, {}, preset.axisA, preset.axisB, ['projectIrr']) },
      { key: 'stale', label: 'Stale grid', scenario: 'likely', stale: true, grid: sensitivity(raw, {}, preset.axisA, preset.axisB, ['projectIrr']) },
    ],
    settings: { ...DEFAULT_PACKAGE_SETTINGS, ...overrides },
  };
}

describe('package pages (spec 8)', () => {
  it('plans the nine pages in order, landscape where noted, and omits stale grids with a note', () => {
    const planned = planPages(props());
    expect(planned.map((p) => p.key)).toEqual([...PAGE_KEYS]);
    expect(planned.find((p) => p.key === 'annualCashFlow')!.landscape).toBe(true);
    expect(planned.find((p) => p.key === 'appendix')!.landscape).toBe(true);
    expect(planned.filter((p) => p.landscape)).toHaveLength(2);
    const html = renderPackageHtml(props());
    expect(html).toContain('1 saved grid is stale');
    expect(html).toMatch(/Page 1 of 9/);
    expect(html).toContain('@page landscape');
  });

  it('respects page toggles, the shown scenario, the letterhead and the reviewed line', () => {
    const p = props({ pages: { ...DEFAULT_PACKAGE_SETTINGS.pages, sensitivities: false, appendix: false }, scenario: 'worst', narrative: 'A narrative paragraph.' });
    p.letterhead = { orgName: 'Acme Development', address: '1 Main St', imageUrl: 'data:image/svg+xml;base64,PHN2Zy8+' };
    p.version.reviewedBy = 'Mark & Co.';
    const planned = planPages(p);
    expect(planned.map((x) => x.key)).toEqual(['summary', 'returns', 'sourcesUses', 'capitalBudget', 'annualCashFlow', 'saleAnalysis', 'assumptions']);
    const html = renderPackageHtml(p);
    expect(html).toContain('Scenario: Worst');
    expect(html).toContain('Acme Development');
    expect(html).toContain('Reviewed by Mark &amp; Co.');
    expect(html).toContain('A narrative paragraph.');
    expect(html).not.toContain('data-page="appendix"');
    expect(html).toContain('Page 7 of 7');
  });

  it('includes the monthly appendix only when asked', () => {
    expect(renderPackageHtml(props())).not.toContain('Monthly schedule');
    expect(renderPackageHtml(props({ includeMonthlyAppendix: true }))).toContain('Monthly schedule');
  });

  it('12.5: sources & uses totals equal TPC after rounding parts and total independently', () => {
    const p = props();
    const o = p.outputs.likely;
    const total = roundUsd(o.totals.tpc);
    expect(roundUsd(o.sourcesUses.totalUses)).toBe(total);
    expect(roundUsd(o.sourcesUses.totalSources)).toBe(total);
    // Parts rounded independently may not foot, which the footnote states; the gap stays under one rounding step per line.
    const parts = o.sourcesUses.uses.reduce((s, l) => s + roundUsd(l.amount), 0);
    expect(Math.abs(parts - total)).toBeLessThanOrEqual(1000 * o.sourcesUses.uses.length);
    const html = renderPackageHtml(p);
    expect(html).toContain('Figures rounded; totals may not foot.');
  });

  it('builds export file names from the deal, scenario and version date', () => {
    expect(packageFileName('Needham 60 — example deal', 'likely', '2026-11-04', 'pdf')).toBe('needham-60-example-deal-likely-2026-11-04.pdf');
    expect(packageFileName('', 'best', '2026-01-01', 'xlsx')).toBe('deal-best-2026-01-01.xlsx');
  });
});
