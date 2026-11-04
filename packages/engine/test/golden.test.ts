import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { run } from '../src/run';
import type { GoldenAdapter, GoldenFile, GoldenTolerances } from './golden/types';

const dir = join(__dirname, 'golden');
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')) : [];

const MONEY = [
  'tpc',
  'equity',
  'loanAmount',
  'capitalizedInterest',
  'stabilizedNOI',
  'saleValue',
] as const;
const IRRS = ['unleveredIRR', 'leveredIRR', 'lpIRR', 'gpIRR'] as const;

function tol(t: GoldenTolerances, metric: string) {
  const per = t.perMetric?.[metric] ?? {};
  return {
    moneyRel: per.moneyRel ?? t.moneyRel ?? 0.005,
    moneyAbs: per.moneyAbs ?? t.moneyAbs ?? 1000,
    irr: per.irr ?? t.irr ?? 0.0025,
    annual: per.annual ?? t.annual ?? 0.01,
  };
}

describe('12.3 golden tests against the reference workbooks', () => {
  it('has the harness in place (workbooks are added to reference/ and extracted by scripts/extract-golden.py)', () => {
    expect(existsSync(join(dir, 'README.md'))).toBe(true);
    if (files.length === 0) {
      console.log(
        'golden: no extracted workbook values present; see reference/README.md and docs/progress.md',
      );
    }
  });

  for (const file of files) {
    const golden = JSON.parse(readFileSync(join(dir, file), 'utf8')) as GoldenFile;
    it(`reproduces ${golden.model} within the 12.3 tolerances`, async () => {
      const adapterPath = join(dir, 'adapters', `${golden.model}.ts`);
      expect(
        existsSync(adapterPath),
        `adapter missing for ${golden.model}: write test/golden/adapters/${golden.model}.ts`,
      ).toBe(true);
      const mod = (await import(adapterPath)) as { adapt: GoldenAdapter };
      const { inputs, notes, tolerances } = mod.adapt(golden);
      for (const n of notes) console.log(`[${golden.model}] ${n}`);
      const out = run(inputs);
      const actual: Record<string, number | null> = {
        tpc: out.totals.tpc,
        equity: out.totals.totalContributions,
        loanAmount: out.totals.constructionLoan,
        capitalizedInterest: out.totals.capitalizedInterest,
        stabilizedNOI: out.metrics.stabilizedNoi,
        saleValue: out.sale.value,
        unleveredIRR: out.metrics.unleveredIrr,
        leveredIRR: out.metrics.projectIrr,
        lpIRR: out.metrics.lpIrr,
        gpIRR: out.metrics.gpIrr,
        equityMultiple: out.metrics.equityMultiple,
      };
      for (const m of MONEY) {
        const exp = golden.expected[m]?.value;
        if (typeof exp !== 'number') continue;
        const t = tol(tolerances, m);
        expect(
          Math.abs((actual[m] ?? NaN) - exp),
          `${m}: engine ${actual[m]} vs workbook ${exp}`,
        ).toBeLessThanOrEqual(Math.max(t.moneyRel * Math.abs(exp), t.moneyAbs));
      }
      for (const m of IRRS) {
        const exp = golden.expected[m]?.value;
        if (typeof exp !== 'number') continue;
        expect(
          Math.abs((actual[m] ?? NaN) - exp),
          `${m}: engine ${actual[m]} vs workbook ${exp}`,
        ).toBeLessThanOrEqual(tol(tolerances, m).irr);
      }
      const em = golden.expected.equityMultiple?.value;
      if (typeof em === 'number')
        expect(Math.abs((actual.equityMultiple ?? NaN) - em)).toBeLessThanOrEqual(0.02);
      const series: Array<[string, number[]]> = [
        ['annualNOI', out.annual.map((a) => a.noi)],
        ['annualDebtService', out.annual.map((a) => a.debtService.total)],
      ];
      for (const [name, ours] of series) {
        const exp = golden.expected[name]?.value;
        if (!Array.isArray(exp)) continue;
        exp.forEach((v, i) => {
          if (typeof v !== 'number') return;
          const t = tol(tolerances, name);
          expect(Math.abs((ours[i] ?? NaN) - v), `${name}[${i}]`).toBeLessThanOrEqual(
            Math.max(t.annual * Math.abs(v), t.moneyAbs),
          );
        });
      }
    });
  }
});
