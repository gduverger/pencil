import { describe, expect, it } from 'vitest';
import { validate, hasErrors } from '../src/validate';
import { fixtureDeal } from './fixtures';

const codes = (raw: unknown) => validate(raw).map((i) => `${i.level}:${i.code}`);

describe('validate', () => {
  it('passes the fixture deal with no errors', () => {
    const issues = validate(fixtureDeal());
    expect(hasErrors(issues)).toBe(false);
  });

  it('rejects a hold period shorter than stabilization (S < Z)', () => {
    expect(codes({ ...fixtureDeal(), meta: { ...fixtureDeal().meta, holdMonths: 41 } })).toContain(
      'error:hold-shorter-than-stabilization',
    );
    expect(
      codes({ ...fixtureDeal(), meta: { ...fixtureDeal().meta, holdMonths: 42 } }),
    ).not.toContain('error:hold-shorter-than-stabilization');
  });

  it('rejects a refinance after the sale', () => {
    const d = fixtureDeal();
    expect(
      codes({
        ...d,
        financing: {
          ...d.financing,
          permanent: { ...d.financing!.permanent, monthsAfterStabilization: 100 },
        },
      }),
    ).toContain('error:refinance-after-sale');
  });

  it('rejects a unit mix that does not sum to 100%', () => {
    const d = fixtureDeal();
    expect(
      codes({
        ...d,
        program: {
          ...d.program,
          unitTypes: [{ key: '1BR', mixPct: 0.5, avgSF: 650, rentPerMonth: 2700 }],
        },
      }),
    ).toContain('error:unit-mix-not-100');
  });

  it('rejects custom weights of the wrong length', () => {
    const d = fixtureDeal();
    expect(
      codes({
        ...d,
        costs: {
          ...d.costs,
          hard: { ...d.costs!.hard, distribution: { kind: 'custom', weights: [1, 2] } },
        },
      }),
    ).toContain('error:custom-weights-length');
  });

  it('rejects cost events after the development period and any event after the sale', () => {
    const d = fixtureDeal();
    expect(
      codes({
        ...d,
        events: [{ id: 'x', label: 'x', month: 50, amount: 1, kind: 'cost', category: 'other' }],
      }),
    ).toContain('error:event-after-refinance');
    expect(
      codes({
        ...d,
        events: [
          { id: 'x', label: 'x', month: 500, amount: 1, kind: 'inflow', category: 'inflow' },
        ],
      }),
    ).toContain('error:event-after-sale');
    expect(
      codes({
        ...d,
        events: [
          { id: 'x', label: 'x', month: 100, amount: 1, kind: 'inflow', category: 'inflow' },
        ],
      }),
    ).not.toContain('error:event-after-refinance');
  });

  it('rejects bad equity splits and waterfall tiers', () => {
    const d = fixtureDeal();
    expect(codes({ ...d, equity: { gpPct: 0.2, lpPct: 0.9 } })).toContain(
      'error:equity-split-not-100',
    );
    expect(
      codes({
        ...d,
        equity: {
          gpPct: 0.1,
          lpPct: 0.9,
          tiers: [{ hurdleIrrPct: 0.08, lpSplit: 0.9, gpSplit: 0.1 }],
        },
      }),
    ).toContain('error:last-tier-hurdle');
    expect(
      codes({
        ...d,
        equity: {
          gpPct: 0.1,
          lpPct: 0.9,
          tiers: [
            { hurdleIrrPct: 0.15, lpSplit: 0.9, gpSplit: 0.1 },
            { hurdleIrrPct: 0.08, lpSplit: 0.7, gpSplit: 0.3 },
            { hurdleIrrPct: null, lpSplit: 0.5, gpSplit: 0.5 },
          ],
        },
      }),
    ).toContain('error:tier-hurdles-decreasing');
    expect(
      codes({
        ...d,
        equity: {
          gpPct: 0.1,
          lpPct: 0.9,
          tiers: [
            { hurdleIrrPct: 0.08, lpSplit: 0.6, gpSplit: 0.1 },
            { hurdleIrrPct: null, lpSplit: 0.5, gpSplit: 0.5 },
          ],
        },
      }),
    ).toContain('error:tier-splits-not-100');
  });

  it('rejects leverage at or above 100% and warns above 90%', () => {
    const d = fixtureDeal();
    expect(
      codes({
        ...d,
        financing: { ...d.financing, constructionLoan: { ltc: 1, ratePct: 0.08, feePct: 0 } },
      }),
    ).toContain('error:leverage-over-100');
    expect(
      codes({
        ...d,
        financing: { ...d.financing, constructionLoan: { ltc: 0.92, ratePct: 0.08, feePct: 0 } },
      }),
    ).toContain('warning:high-leverage');
  });

  it('rejects a land loan on owned land', () => {
    const d = fixtureDeal();
    expect(
      codes({
        ...d,
        site: { ...d.site, landOwned: true },
        financing: { ...d.financing, landLoan: { enabled: true } },
      }),
    ).toContain('error:land-loan-on-owned-land');
  });

  it('reports schema problems with paths', () => {
    const issues = validate({ ...fixtureDeal(), program: { totalUnits: -5 } });
    expect(issues.some((i) => i.code === 'schema' && i.path === 'program.totalUnits')).toBe(true);
  });
});

describe('validate: remaining branches', () => {
  it('flags duplicate unit types, duplicate events and category mismatches', () => {
    const d = fixtureDeal();
    expect(
      codes({
        ...d,
        program: {
          ...d.program,
          unitTypes: [
            { key: '1BR', mixPct: 0.5, avgSF: 650, rentPerMonth: 2700 },
            { key: '1BR', mixPct: 0.5, avgSF: 650, rentPerMonth: 2700 },
          ],
        },
      }),
    ).toContain('error:duplicate-unit-type');
    expect(codes({ ...d, program: { ...d.program, unitTypes: [] } })).toContain(
      'error:no-unit-types',
    );
    expect(
      codes({
        ...d,
        events: [
          { id: 'x', label: 'x', month: 1, amount: 1, kind: 'cost', category: 'other' },
          { id: 'x', label: 'y', month: 1, amount: 1, kind: 'cost', category: 'other' },
        ],
      }),
    ).toContain('error:duplicate-event');
    expect(
      codes({
        ...d,
        events: [{ id: 'x', label: 'x', month: 1, amount: 1, kind: 'inflow', category: 'other' }],
      }),
    ).toContain('warning:inflow-category');
    expect(
      codes({
        ...d,
        events: [{ id: 'x', label: 'x', month: 1, amount: 1, kind: 'cost', category: 'inflow' }],
      }),
    ).toContain('error:cost-event-inflow-category');
  });

  it('warns on commercial without area, LTV over 100%, and rejects affordable share over 100%', () => {
    const d = fixtureDeal();
    expect(
      codes({ ...d, program: { ...d.program, commercial: { enabled: true, grossSF: 0 } } }),
    ).toContain('warning:commercial-no-area');
    expect(
      codes({ ...d, program: { ...d.program, affordable: { enabled: true, pctUnits: 1.5 } } }),
    ).toContain('error:affordable-share');
    expect(
      codes({
        ...d,
        financing: { ...d.financing, permanent: { ...d.financing!.permanent, maxLTV: 1.2 } },
      }),
    ).toContain('warning:ltv-over-100');
  });

  it('rejects zero-sum custom weights, missing hurdles, zero LP splits, empty tiers and bad vacancy', () => {
    const d = fixtureDeal();
    expect(
      codes({
        ...d,
        costs: {
          ...d.costs,
          hard: {
            ...d.costs!.hard,
            distribution: { kind: 'custom', weights: new Array(18).fill(0) },
          },
        },
      }),
    ).toContain('error:custom-weights-zero');
    expect(
      codes({
        ...d,
        equity: {
          gpPct: 0.1,
          lpPct: 0.9,
          tiers: [
            { hurdleIrrPct: null, lpSplit: 0.9, gpSplit: 0.1 },
            { hurdleIrrPct: null, lpSplit: 0.5, gpSplit: 0.5 },
          ],
        },
      }),
    ).toContain('error:tier-hurdle-missing');
    expect(
      codes({
        ...d,
        equity: {
          gpPct: 0.1,
          lpPct: 0.9,
          tiers: [
            { hurdleIrrPct: 0.08, lpSplit: 0, gpSplit: 1 },
            { hurdleIrrPct: null, lpSplit: 0.5, gpSplit: 0.5 },
          ],
        },
      }),
    ).toContain('error:tier-lp-split-zero');
    expect(codes({ ...d, equity: { gpPct: 0.1, lpPct: 0.9, tiers: [] } })).toContain(
      'error:no-tiers',
    );
    expect(codes({ ...d, operations: { ...d.operations, stabilizedVacancyPct: 1 } })).toContain(
      'error:vacancy-over-100',
    );
    expect(codes({ ...d, operations: { ...d.operations, creditLossPct: 1 } })).toContain(
      'error:credit-loss-over-100',
    );
  });
});
