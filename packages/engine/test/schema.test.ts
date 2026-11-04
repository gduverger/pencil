import { describe, expect, it } from 'vitest';
import { DEFAULT_TIERS, catalogEntry, dealInputsJsonSchema, inputCatalog, parseInputs, starInputs } from '../src/schema';

describe('7.2 input schema', () => {
  it('applies every default to an empty deal', () => {
    const d = parseInputs({});
    expect(d.meta.holdMonths).toBe(120);
    expect(d.site.closingCostPct).toBe(0.02);
    expect(d.program.efficiency).toBe(0.85);
    expect(d.costs.hard.contingencyPct).toBe(0.05);
    expect(d.costs.hard.distribution).toEqual({ kind: 'scurve' });
    expect(d.costs.soft.predevShare).toBe(0.6);
    expect(d.financing.constructionLoan.feePct).toBe(0.01);
    expect(d.financing.permanent.monthsAfterStabilization).toBe(0);
    expect(d.financing.capitalizeOperatingDeficits).toBe(true);
    expect(d.operations.stabilizedVacancyPct).toBe(0.05);
    expect(d.operations.creditLossPct).toBe(0.005);
    expect(d.exit.brokerFeePct).toBe(0.02);
    expect(d.exit.closingCostPct).toBe(0.01);
    expect(d.equity.tiers).toEqual(DEFAULT_TIERS);
    expect(d.events).toEqual([]);
  });

  it('catalogues every leaf input with a path, unit and label', () => {
    const catalog = inputCatalog();
    const paths = catalog.map((e) => e.path);
    expect(paths).toContain('costs.hard.perGrossSF');
    expect(paths).toContain('program.unitTypes[1BR].rentPerMonth');
    expect(paths).toContain('financing.permanent.ratePct');
    expect(catalogEntry('costs.hard.perGrossSF')).toMatchObject({ unit: 'usd_per_sf', star: true, elaborable: true, default: 350 });
    expect(catalogEntry('operations.opex.insurancePerUnit')?.elaborable).toBe(true);
    expect(catalogEntry('site.landOwned')?.unit).toBe('flag');
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('marks the tonight inputs with a star', () => {
    const stars = starInputs().map((e) => e.path);
    for (const p of [
      'meta.holdMonths',
      'site.landCost',
      'program.totalUnits',
      'timeline.predevMonths',
      'timeline.constructionMonths',
      'timeline.leaseUpMonths',
      'costs.hard.perGrossSF',
      'costs.soft.pctOfHard',
      'financing.constructionLoan.ltc',
      'financing.constructionLoan.ratePct',
      'financing.permanent.ratePct',
      'financing.permanent.amortYears',
      'operations.opex.taxesStabilizedAnnual',
      'exit.exitCapRatePct',
      'equity.gpPct',
    ]) {
      expect(stars).toContain(p);
    }
  });

  it('generates a JSON Schema carrying units, labels and elaborable flags', () => {
    const js = dealInputsJsonSchema() as { properties: Record<string, { properties: Record<string, unknown> }> };
    const hard = js.properties.costs!.properties.hard as { properties: Record<string, Record<string, unknown>> };
    expect(hard.properties.perGrossSF).toMatchObject({ unit: 'usd_per_sf', elaborable: true, default: 350 });
  });
});
