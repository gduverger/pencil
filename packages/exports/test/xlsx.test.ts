import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ENGINE_VERSION, runScenarios, scenarioOverridesFromDeltas } from '@pencil/engine';
import { registerFromInputs } from '@pencil/package-pages';
import { buildWorkbookBuffer, FORMATS } from '../src/xlsx';

const example = join(__dirname, '..', '..', '..', 'apps', 'cli', 'examples', 'needham-60.json');

async function workbook() {
  const raw = JSON.parse(readFileSync(example, 'utf8')) as unknown;
  const outputs = runScenarios(raw, scenarioOverridesFromDeltas(raw));
  const buf = await buildWorkbookBuffer({
    outputs,
    scenario: 'likely',
    version: { dealName: 'Needham 60', versionNumber: 1, versionDate: '2026-11-04', engineVersion: ENGINE_VERSION },
    register: registerFromInputs(outputs),
  });
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return { wb, outputs };
}

const formulaOf = (cell: ExcelJS.Cell) => (cell.value && typeof cell.value === 'object' && 'formula' in cell.value ? (cell.value as { formula: string }).formula : null);

describe('8.11 Excel export', () => {
  it('has the seven sheets with frozen headers and the cover note naming the Version', async () => {
    const { wb } = await workbook();
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Assumptions', 'Annual', 'Monthly', 'Capital budget', 'Sources & uses', 'Amortization', 'Returns']);
    expect(wb.getWorksheet('Annual')!.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    const assumptions = wb.getWorksheet('Assumptions')!;
    let note = '';
    assumptions.eachRow((row) => {
      const v = row.getCell(1).value;
      if (typeof v === 'string' && v.startsWith('This workbook is a snapshot')) note = v;
    });
    expect(note).toContain('Version 1 (2026-11-04)');
    expect(note).toContain('does not recompute');
    expect(assumptions.getCell('A1').value).toBe('Section');
    expect(assumptions.getRow(2).getCell(2).value).toBe('Deal name');
  });

  it('totals are SUM formulas and number formats follow 7.13', async () => {
    const { wb } = await workbook();
    const annual = wb.getWorksheet('Annual')!;
    let egiRow = 0;
    let noiRow = 0;
    let opexRow = 0;
    annual.eachRow((row, n) => {
      const label = row.getCell(1).value;
      if (label === 'Effective gross income') egiRow = n;
      if (label === 'Net operating income') noiRow = n;
      if (label === 'Total operating expenses') opexRow = n;
    });
    expect(formulaOf(annual.getCell(egiRow, 2))).toMatch(/^SUM\(B\d+:B\d+\)$/);
    expect(formulaOf(annual.getCell(opexRow, 2))).toMatch(/^SUM\(B\d+:B\d+\)$/);
    expect(formulaOf(annual.getCell(noiRow, 2))).toBe(`B${egiRow}+B${opexRow}`);
    expect(annual.getCell(2, 2).numFmt).toBe(FORMATS.usd);

    const monthly = wb.getWorksheet('Monthly')!;
    expect(formulaOf(monthly.getCell(3, 2))).toMatch(/^SUM\(C3:[A-Z]+3\)$/);

    const budget = wb.getWorksheet('Capital budget')!;
    const subtotals: string[] = [];
    let totalFormula: string | null = null;
    budget.eachRow((row) => {
      const label = row.getCell(1).value;
      if (typeof label === 'string' && label.startsWith('Subtotal')) subtotals.push(formulaOf(row.getCell(2)) ?? '');
      if (label === 'Total project cost') totalFormula = formulaOf(row.getCell(2));
    });
    expect(subtotals.length).toBeGreaterThanOrEqual(5);
    for (const f of subtotals) expect(f).toMatch(/^(SUM\(B\d+:B\d+\)|B\d+(\+B\d+)*)$/);
    expect(totalFormula).toMatch(/^B\d+(\+B\d+)+$/);

    const su = wb.getWorksheet('Sources & uses')!;
    const totals: string[] = [];
    su.eachRow((row) => {
      const label = row.getCell(1).value;
      if (label === 'Total sources' || label === 'Total uses') totals.push(formulaOf(row.getCell(2)) ?? '');
    });
    expect(totals).toHaveLength(2);
    for (const f of totals) expect(f).toMatch(/^(SUM\(B\d+:B\d+\)|B\d+(\+B\d+)*)$/);

    const amort = wb.getWorksheet('Amortization')!;
    expect(formulaOf(amort.getCell(3, 2))).toBe('F2');
    expect(formulaOf(amort.getCell(3, 4))).toBe('B3*$J$2');
    expect(formulaOf(amort.getCell(3, 6))).toBe('B3-E3');
    expect(amort.getCell(3, 2).numFmt).toBe(FORMATS.usdCents);

    const returns = wb.getWorksheet('Returns')!;
    expect(returns.getCell(2, 1).value).toBe('Unlevered IRR');
    expect(returns.getCell(2, 2).numFmt).toBe(FORMATS.irr);
    expect(returns.getCell(6, 2).numFmt).toBe(FORMATS.multiple);
    expect(returns.getCell(9, 2).numFmt).toBe(FORMATS.pct);
    expect(returns.getCell(9, 2).value).toBeTypeOf('number');
  });

  it("the Annual sheet's NOI row equals the engine's annual NOI (full precision)", async () => {
    const { wb, outputs } = await workbook();
    const annual = wb.getWorksheet('Annual')!;
    let egiRow = 0;
    let opexRow = 0;
    annual.eachRow((row, n) => {
      if (row.getCell(1).value === 'Effective gross income') egiRow = n;
      if (row.getCell(1).value === 'Total operating expenses') opexRow = n;
    });
    // Evaluate the SUM formulas over the written values and compare with the engine.
    const sumRange = (col: number, from: number, to: number) => {
      let s = 0;
      for (let r = from; r <= to; r++) s += Number(annual.getCell(r, col).value ?? 0);
      return s;
    };
    const egiFormula = formulaOf(annual.getCell(egiRow, 2))!;
    const [, a, b] = egiFormula.match(/B(\d+):B(\d+)/)!;
    const opexFormula = formulaOf(annual.getCell(opexRow, 2))!;
    const [, c, d] = opexFormula.match(/B(\d+):B(\d+)/)!;
    outputs.likely.annual.forEach((y, j) => {
      const col = 2 + j;
      const egi = sumRange(col, Number(a), Number(b));
      const opex = sumRange(col, Number(c), Number(d));
      expect(egi + opex).toBeCloseTo(y.noi, 6);
      expect(egi).toBeCloseTo(y.egi, 6);
    });
    // Monthly NOI row total equals the sum of monthly NOI
    const monthly = wb.getWorksheet('Monthly')!;
    let noiRowM = 0;
    monthly.eachRow((row, n) => {
      if (row.getCell(1).value === 'Net operating income') noiRowM = n;
    });
    let total = 0;
    for (let j = 0; j < outputs.likely.months.length; j++) total += Number(monthly.getCell(noiRowM, 3 + j).value);
    expect(total).toBeCloseTo(outputs.likely.months.reduce((s, m) => s + m.noi, 0), 6);
  });
});
