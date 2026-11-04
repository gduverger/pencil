/**
 * `validate(inputs)`: errors block a run; warnings become flags (7.14).
 */

import { DealInputsSchema, type DealInputs } from './schema';
import { buildTimeline } from './timeline';
import type { ValidationIssue } from './types';

const EPS = 1e-6;

export function validate(raw: unknown): ValidationIssue[] {
  const parsed = DealInputsSchema.safeParse(raw);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => ({
      level: 'error' as const,
      code: 'schema',
      path: issue.path
        .map((p) => (typeof p === 'number' ? `[${p}]` : String(p)))
        .join('.')
        .replace(/\.\[/g, '['),
      message: issue.message,
    }));
  }
  return validateParsed(parsed.data);
}

export function validateParsed(inputs: DealInputs): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const error = (code: string, message: string, path?: string) =>
    issues.push({ level: 'error', code, message, ...(path ? { path } : {}) });
  const warning = (code: string, message: string, path?: string) =>
    issues.push({ level: 'warning', code, message, ...(path ? { path } : {}) });

  const tl = buildTimeline(inputs);
  if (tl.S < tl.Z) {
    error(
      'hold-shorter-than-stabilization',
      `hold period (${tl.S} months) ends before stabilization (month ${tl.Z})`,
      'meta.holdMonths',
    );
  }
  if (tl.permanentEnabled && tl.R > tl.S) {
    error(
      'refinance-after-sale',
      `refinance month ${tl.R} is after the sale month ${tl.S}`,
      'financing.permanent.monthsAfterStabilization',
    );
  }

  // Program.
  if (inputs.program.unitTypes.length === 0) {
    error('no-unit-types', 'at least one unit type is required', 'program.unitTypes');
  } else {
    const mixTotal = inputs.program.unitTypes.reduce((s, u) => s + u.mixPct, 0);
    if (Math.abs(mixTotal - 1) > 1e-3) {
      error(
        'unit-mix-not-100',
        `unit mix shares sum to ${(mixTotal * 100).toFixed(1)}%, not 100%`,
        'program.unitTypes',
      );
    }
    const keys = new Set<string>();
    for (const u of inputs.program.unitTypes) {
      if (keys.has(u.key))
        error(
          'duplicate-unit-type',
          `unit type ${u.key} appears twice`,
          `program.unitTypes[${u.key}]`,
        );
      keys.add(u.key);
    }
  }
  if (inputs.program.commercial.enabled && inputs.program.commercial.grossSF <= 0) {
    warning(
      'commercial-no-area',
      'commercial space is on but has no gross SF',
      'program.commercial.grossSF',
    );
  }
  if (inputs.program.affordable.enabled && inputs.program.affordable.pctUnits > 1) {
    error(
      'affordable-share',
      'affordable share of units cannot exceed 100%',
      'program.affordable.pctUnits',
    );
  }

  // Distributions.
  const C = tl.O - tl.P;
  const checkCustom = (
    d: DealInputs['costs']['hard']['distribution'] | undefined,
    len: number,
    path: string,
  ) => {
    if (!d || d.kind !== 'custom') return;
    if (d.weights.length !== len) {
      error(
        'custom-weights-length',
        `custom distribution has ${d.weights.length} weights; the window is ${len} months`,
        path,
      );
    } else if (!(d.weights.reduce((a, b) => a + b, 0) > 0)) {
      error('custom-weights-zero', 'custom distribution weights sum to zero', path);
    }
  };
  checkCustom(inputs.costs.hard.distribution, C, 'costs.hard.distribution');
  inputs.costs.hard.lines?.forEach((l, i) =>
    checkCustom(l.distribution, C, `costs.hard.lines[${i}].distribution`),
  );
  inputs.costs.soft.lines?.forEach((l, i) =>
    checkCustom(l.distribution, tl.O, `costs.soft.lines[${i}].distribution`),
  );

  // Events.
  const eventIds = new Set<string>();
  for (const ev of inputs.events) {
    if (eventIds.has(ev.id))
      error('duplicate-event', `event id ${ev.id} appears twice`, `events[${ev.id}]`);
    eventIds.add(ev.id);
    if (ev.month > tl.S)
      error(
        'event-after-sale',
        `event "${ev.label}" is at month ${ev.month}, after the sale`,
        `events[${ev.id}].month`,
      );
    else if (ev.kind === 'cost' && ev.month > tl.R) {
      error(
        'event-after-refinance',
        `cost event "${ev.label}" is at month ${ev.month}, after the development period ends at month ${tl.R}`,
        `events[${ev.id}].month`,
      );
    }
    if (ev.kind === 'inflow' && ev.category !== 'inflow') {
      warning(
        'inflow-category',
        `inflow event "${ev.label}" should use the inflow category`,
        `events[${ev.id}].category`,
      );
    }
    if (ev.kind === 'cost' && ev.category === 'inflow') {
      error(
        'cost-event-inflow-category',
        `cost event "${ev.label}" cannot use the inflow category`,
        `events[${ev.id}].category`,
      );
    }
  }

  // Financing.
  const fin = inputs.financing;
  if (fin.landLoan.enabled && inputs.site.landOwned) {
    error(
      'land-loan-on-owned-land',
      'a land loan cannot be modeled on land contributed in kind',
      'financing.landLoan.enabled',
    );
  }
  const totalLeverage = fin.constructionLoan.ltc + (fin.mezz.enabled ? fin.mezz.pctOfCost : 0);
  if (totalLeverage >= 1) {
    error(
      'leverage-over-100',
      `construction loan plus mezzanine fund ${(totalLeverage * 100).toFixed(0)}% of cost; equity would be negative`,
      'financing.constructionLoan.ltc',
    );
  } else if (totalLeverage > 0.9) {
    warning(
      'high-leverage',
      `construction loan plus mezzanine fund ${(totalLeverage * 100).toFixed(0)}% of cost`,
      'financing.constructionLoan.ltc',
    );
  }
  if (fin.permanent.enabled && fin.permanent.maxLTV > 1) {
    warning(
      'ltv-over-100',
      'permanent loan maximum LTV is above 100%',
      'financing.permanent.maxLTV',
    );
  }

  // Equity and waterfall.
  if (Math.abs(inputs.equity.gpPct + inputs.equity.lpPct - 1) > EPS) {
    error('equity-split-not-100', 'GP and LP shares must sum to 100%', 'equity.gpPct');
  }
  const tiers = inputs.equity.tiers;
  if (tiers.length === 0) {
    error('no-tiers', 'at least one waterfall tier is required', 'equity.tiers');
  } else {
    let prevHurdle = -Infinity;
    tiers.forEach((tier, i) => {
      const last = i === tiers.length - 1;
      const path = `equity.tiers[${i}]`;
      if (Math.abs(tier.lpSplit + tier.gpSplit - 1) > EPS)
        error('tier-splits-not-100', `tier ${i + 1} splits must sum to 100%`, path);
      if (last) {
        if (tier.hurdleIrrPct !== null)
          error(
            'last-tier-hurdle',
            'the last tier must have no hurdle (null) so it takes the residual',
            path,
          );
      } else {
        if (tier.hurdleIrrPct === null)
          error(
            'tier-hurdle-missing',
            `tier ${i + 1} needs an IRR hurdle; only the last tier is residual`,
            path,
          );
        else {
          if (tier.hurdleIrrPct < prevHurdle - EPS)
            error(
              'tier-hurdles-decreasing',
              `tier ${i + 1} hurdle is below the previous tier's`,
              path,
            );
          prevHurdle = tier.hurdleIrrPct;
        }
        if (tier.lpSplit <= 0)
          error('tier-lp-split-zero', `tier ${i + 1} must pay the LP a positive share`, path);
      }
    });
  }

  // Operations sanity.
  if (inputs.operations.stabilizedVacancyPct >= 1)
    error(
      'vacancy-over-100',
      'stabilized vacancy must be below 100%',
      'operations.stabilizedVacancyPct',
    );
  if (inputs.operations.creditLossPct >= 1)
    error('credit-loss-over-100', 'credit loss must be below 100%', 'operations.creditLossPct');

  return issues;
}

export function hasErrors(issues: readonly ValidationIssue[]): boolean {
  return issues.some((i) => i.level === 'error');
}
