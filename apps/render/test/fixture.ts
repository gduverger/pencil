import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, runScenarios, scenarioOverridesFromDeltas, sensitivity, sensitivityPresets } from '@pencil/engine';
import { DEFAULT_PACKAGE_SETTINGS, registerFromInputs, type PackageProps } from '@pencil/package-pages';
import { renderPackageHtml } from '@pencil/package-pages/render';

const here = dirname(fileURLToPath(import.meta.url));
export const EXAMPLE_DEAL = join(here, '..', '..', 'cli', 'examples', 'needham-60.json');

/** Package props for the example deal, with two preset grids (one stale) and a letterhead. */
export function fixtureProps(overrides: Partial<PackageProps['settings']> = {}): PackageProps {
  const raw = JSON.parse(readFileSync(EXAMPLE_DEAL, 'utf8')) as unknown;
  const outputs = runScenarios(raw, scenarioOverridesFromDeltas(raw));
  const presets = sensitivityPresets(raw);
  const grids = presets.slice(0, 2).map((p, i) => ({
    key: p.key,
    label: p.label,
    scenario: 'likely' as const,
    stale: i === 1,
    grid: sensitivity(raw, {}, p.axisA, p.axisB, ['projectIrr', 'yieldOnCost']),
  }));
  const letterheadSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="290" height="48"><rect width="48" height="48" rx="8" fill="#2a78d6"/><text x="60" y="31" font-family="Inter, Arial" font-size="20" font-weight="600" fill="#111">Needham Partners</text></svg>`;
  return {
    outputs,
    version: { dealName: outputs.likely.inputs.meta.name, versionNumber: 3, versionDate: '2026-11-04', engineVersion: ENGINE_VERSION, preparedBy: 'Needham Partners LLC', reviewedBy: 'Mark & Co. Advisors' },
    letterhead: { orgName: 'Needham Partners LLC', address: '12 Chapel Street, Needham, MA 02492', imageUrl: `data:image/svg+xml;base64,${Buffer.from(letterheadSvg).toString('base64')}` },
    register: registerFromInputs(outputs, { source: 'my-number', updatedAt: '2026-11-04' }).map((e) =>
      e.path === 'costs.hard.perGrossSF'
        ? { ...e, source: 'quote', note: 'GC budget 2026-10-15, wood frame over podium', benchmark: { low: 280, mid: 320, high: 360, asOf: '2026-09', source: 'Mark — 2025 bids, 4 projects' } }
        : e.path === 'program.unitTypes[2BR].rentPerMonth'
          ? { ...e, source: 'comp', note: 'Three 2024–25 lease comps within 1 mile', benchmark: { low: 2700, mid: 3000, high: 3200, asOf: '2026-09', source: 'Mark — inner suburbs' }, flag: 'Above the $2,700–$3,200 range for inner suburbs as of 2026-09' }
          : e,
    ),
    sensitivities: grids,
    settings: { ...DEFAULT_PACKAGE_SETTINGS, narrative: undefined, coverNote: 'Prepared for Needham Cooperative Bank. Assumptions as of November 2026; see the register for sources.', ...overrides },
    site: { address: '120 Highland Avenue, Needham, MA 02494', town: 'Needham', townCluster: 'inner-suburbs', assessedValue: 2_450_000, annualTax: 31_000 },
  };
}

export function fixtureHtml(overrides: Partial<PackageProps['settings']> = {}): string {
  return renderPackageHtml(fixtureProps(overrides));
}
