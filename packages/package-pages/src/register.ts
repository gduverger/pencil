/**
 * Build assumptions-register entries from engine inputs alone (used by the CLI and tests, where
 * no per-input metadata exists). The web app builds entries from the deal's stored metadata.
 */
import { getPath, inputCatalog, type DealInputs, type ScenarioKey, type DealOutputs } from '@pencil/engine';
import type { RegisterEntry } from './types';

export const SECTION_LABELS: Record<string, string> = {
  meta: 'Deal',
  site: 'Site',
  program: 'Program',
  timeline: 'Timeline',
  costs: 'Costs',
  events: 'Events',
  financing: 'Financing',
  operations: 'Operations',
  exit: 'Exit',
  equity: 'Equity and waterfall',
};

export function registerFromInputs(outputs: Record<ScenarioKey, DealOutputs>, defaults: Partial<Pick<RegisterEntry, 'source' | 'updatedAt'>> = {}): RegisterEntry[] {
  const likely: DealInputs = outputs.likely.inputs;
  const entries: RegisterEntry[] = [];
  for (const e of inputCatalog()) {
    const value = getPath(likely, e.path);
    if (value === undefined) continue;
    // Hide switch-dependent inputs when the switch is off.
    if (e.path.startsWith('program.commercial.') && !likely.program.commercial.enabled && e.path !== 'program.commercial.enabled') continue;
    if (e.path.startsWith('program.affordable.') && !likely.program.affordable.enabled && e.path !== 'program.affordable.enabled') continue;
    if (e.path.startsWith('financing.landLoan.') && !likely.financing.landLoan.enabled && e.path !== 'financing.landLoan.enabled') continue;
    if (e.path.startsWith('financing.mezz.') && !likely.financing.mezz.enabled && e.path !== 'financing.mezz.enabled') continue;
    if (e.path.startsWith('financing.permanent.') && !likely.financing.permanent.enabled && e.path !== 'financing.permanent.enabled') continue;
    const best = getPath(outputs.best.inputs, e.path);
    const worst = getPath(outputs.worst.inputs, e.path);
    const overrides: RegisterEntry['overrides'] = {};
    if (best !== undefined && best !== value) overrides.best = best;
    if (worst !== undefined && worst !== value) overrides.worst = worst;
    entries.push({
      path: e.path,
      section: SECTION_LABELS[e.section] ?? e.section,
      label: e.label,
      unit: e.unit,
      value,
      source: defaults.source ?? 'my-number',
      ...(defaults.updatedAt ? { updatedAt: defaults.updatedAt } : {}),
      ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
    });
  }
  for (const ev of likely.events) {
    entries.push({
      path: `events[${ev.id}]`,
      section: SECTION_LABELS.events!,
      label: `${ev.label} (${ev.kind}, ${ev.category}, month ${ev.month})`,
      unit: 'usd',
      value: ev.amount,
      source: defaults.source ?? 'my-number',
      ...(ev.note ? { note: ev.note } : {}),
      ...(defaults.updatedAt ? { updatedAt: defaults.updatedAt } : {}),
    });
  }
  likely.equity.tiers.forEach((tier, i) => {
    entries.push({
      path: `equity.tiers[${i}]`,
      section: SECTION_LABELS.equity!,
      label: `Tier ${i + 1}: ${tier.hurdleIrrPct === null ? 'residual' : `to ${(tier.hurdleIrrPct * 100).toFixed(1)}% IRR`}`,
      unit: 'text',
      value: `LP ${(tier.lpSplit * 100).toFixed(0)}% / GP ${(tier.gpSplit * 100).toFixed(0)}%`,
      source: defaults.source ?? 'my-number',
      ...(defaults.updatedAt ? { updatedAt: defaults.updatedAt } : {}),
    });
  });
  return entries;
}
