/**
 * Excel export (spec 8.11): one workbook with Assumptions, Annual, Monthly, Capital budget,
 * Sources & uses, Amortization and Returns sheets. Totals are real SUM formulas; the workbook is a
 * snapshot of a Version, not a model, and says so on the Assumptions sheet.
 */
import ExcelJS from 'exceljs';
import { OPEX_LINES, type DealOutputs, type Line, type ScenarioKey } from '@pencil/engine';
import { formatByUnit, type RegisterEntry, type VersionMeta } from '@pencil/package-pages';

export interface WorkbookData {
  outputs: Record<ScenarioKey, DealOutputs>;
  scenario: ScenarioKey;
  version: VersionMeta;
  register: RegisterEntry[];
}

/** Number formats per 7.13. */
export const FORMATS = {
  usd: '$#,##0;($#,##0)',
  usdCents: '$#,##0.00;($#,##0.00)',
  pct: '0.00%',
  irr: '0.0%',
  multiple: '0.00"x"',
  count: '#,##0',
  ratio: '0.00',
} as const;

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.fill = HEADER_FILL;
}

function colLetter(n: number): string {
  let s = '';
  let x = n;
  while (x > 0) {
    const m = (x - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    x = Math.floor((x - 1) / 26);
  }
  return s;
}

function addAssumptions(wb: ExcelJS.Workbook, d: WorkbookData) {
  const ws = wb.addWorksheet('Assumptions');
  ws.columns = [
    { header: 'Section', key: 'section', width: 20 },
    { header: 'Input', key: 'label', width: 42 },
    { header: 'Value', key: 'value', width: 18 },
    { header: 'Unit', key: 'unit', width: 16 },
    { header: 'Source', key: 'source', width: 14 },
    { header: 'Note', key: 'note', width: 40 },
    { header: 'Date', key: 'date', width: 12 },
    { header: 'Path', key: 'path', width: 36 },
    { header: 'Benchmark low', key: 'blow', width: 14 },
    { header: 'Benchmark high', key: 'bhigh', width: 14 },
    { header: 'Flag', key: 'flag', width: 40 },
  ];
  styleHeader(ws.getRow(1));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const e of d.register) {
    const numeric = typeof e.value === 'number';
    const row = ws.addRow({
      section: e.section,
      label: e.label,
      value: numeric ? e.value : formatByUnit(e.value, e.unit),
      unit: e.unit,
      source: e.source,
      note: e.note ?? '',
      date: e.updatedAt ? e.updatedAt.slice(0, 10) : '',
      path: e.path,
      blow: e.benchmark?.low ?? '',
      bhigh: e.benchmark?.high ?? '',
      flag: e.flag ?? '',
    });
    if (numeric) {
      const cell = row.getCell('value');
      if (e.unit === 'usd') cell.numFmt = FORMATS.usd;
      else if (e.unit === 'usd_per_sf') cell.numFmt = FORMATS.usdCents;
      else if (e.unit === 'usd_per_unit' || e.unit === 'usd_per_unit_month') cell.numFmt = FORMATS.usd;
      else if (e.unit === 'pct' || e.unit === 'rate_pct') cell.numFmt = FORMATS.pct;
      else cell.numFmt = e.unit === 'count' ? FORMATS.ratio : FORMATS.count;
    }
  }
  ws.addRow([]);
  const note = ws.addRow([
    `This workbook is a snapshot of ${d.version.dealName}, Version ${d.version.versionNumber} (${d.version.versionDate}), ${d.scenario} scenario, computed by the Pencil engine ${d.version.engineVersion}. Changing an input cell does not recompute the model; totals on the other sheets are SUM formulas over the values shown. Figures are full precision; display formats round them.`,
  ]);
  note.getCell(1).alignment = { wrapText: true, vertical: 'top' };
  ws.mergeCells(note.number, 1, note.number, 8);
  note.height = 60;
}

function addAnnual(wb: ExcelJS.Workbook, o: DealOutputs) {
  const ws = wb.addWorksheet('Annual');
  const years = o.annual;
  ws.getCell(1, 1).value = 'Line';
  years.forEach((y, j) => (ws.getCell(1, 2 + j).value = `Year ${y.year}${y.partial ? ' (sale)' : ''}`));
  styleHeader(ws.getRow(1));
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
  ws.getColumn(1).width = 34;
  for (let j = 0; j < years.length; j++) ws.getColumn(2 + j).width = 15;
  const opexLabels: Record<(typeof OPEX_LINES)[number], string> = { taxes: 'Property taxes', insurance: 'Insurance', repairs: 'Repairs and maintenance', payroll: 'Payroll', utilities: 'Utilities', admin: 'Administrative', marketing: 'Marketing', reserves: 'Replacement reserves', management: 'Management', commercial: 'Commercial opex' };
  let r = 2;
  const put = (label: string, f: (y: (typeof years)[number]) => number, fmt: string = FORMATS.usd) => {
    ws.getCell(r, 1).value = label;
    years.forEach((y, j) => {
      const c = ws.getCell(r, 2 + j);
      c.value = f(y);
      c.numFmt = fmt;
    });
    return r++;
  };
  const sumRows = (label: string, from: number, to: number, bold = true) => {
    ws.getCell(r, 1).value = label;
    years.forEach((_, j) => {
      const col = colLetter(2 + j);
      const c = ws.getCell(r, 2 + j);
      c.value = { formula: `SUM(${col}${from}:${col}${to})` };
      c.numFmt = FORMATS.usd;
      if (bold) c.font = { bold: true };
    });
    if (bold) ws.getCell(r, 1).font = { bold: true };
    return r++;
  };
  const gprRow = put('Gross potential rent', (y) => y.gpr);
  put('Vacancy and credit loss', (y) => -y.vacancyAndCreditLoss);
  put('Other income', (y) => y.otherIncome);
  const lastIncome = put('Commercial income', (y) => y.commercialIncome);
  const egiRow = sumRows('Effective gross income', gprRow, lastIncome);
  const firstOpex = r;
  for (const l of OPEX_LINES) put(opexLabels[l], (y) => -y.opex[l]);
  const lastOpex = r - 1;
  const opexRow = sumRows('Total operating expenses', firstOpex, lastOpex);
  ws.getCell(r, 1).value = 'Net operating income';
  ws.getCell(r, 1).font = { bold: true };
  years.forEach((_, j) => {
    const col = colLetter(2 + j);
    const c = ws.getCell(r, 2 + j);
    c.value = { formula: `${col}${egiRow}+${col}${opexRow}` };
    c.numFmt = FORMATS.usd;
    c.font = { bold: true };
  });
  const noiRow = r++;
  const dsI = put('Debt service — interest', (y) => -y.debtService.interest);
  const dsP = put('Debt service — principal', (y) => -y.debtService.principal);
  ws.getCell(r, 1).value = 'Cash flow after debt service';
  ws.getCell(r, 1).font = { bold: true };
  years.forEach((_, j) => {
    const col = colLetter(2 + j);
    const c = ws.getCell(r, 2 + j);
    c.value = { formula: `${col}${noiRow}+SUM(${col}${dsI}:${col}${dsP})` };
    c.numFmt = FORMATS.usd;
    c.font = { bold: true };
  });
  r++;
  put('DSCR', (y) => y.dscr ?? 0, FORMATS.ratio);
  put('Cash-on-cash', (y) => y.cashOnCash ?? 0, FORMATS.pct);
  put('Distributions to LP', (y) => y.distributions.lp);
  put('Distributions to GP', (y) => y.distributions.gp);
  put('Contributions (all partners)', (y) => -(y.contributions.gp + y.contributions.lp));
  return { noiRow };
}

function addMonthly(wb: ExcelJS.Workbook, o: DealOutputs) {
  const ws = wb.addWorksheet('Monthly');
  const months = o.months;
  ws.getCell(1, 1).value = 'Field';
  ws.getCell(1, 2).value = 'Total';
  months.forEach((m, j) => (ws.getCell(1, 3 + j).value = m.t));
  ws.getCell(2, 1).value = 'Phase';
  months.forEach((m, j) => (ws.getCell(2, 3 + j).value = m.phase));
  styleHeader(ws.getRow(1));
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }];
  ws.getColumn(1).width = 30;
  ws.getColumn(2).width = 16;
  for (let j = 0; j < months.length; j++) ws.getColumn(3 + j).width = 13;
  let r = 3;
  const put = (label: string, f: (m: (typeof months)[number]) => number, opts: { total?: boolean; fmt?: string } = {}) => {
    ws.getCell(r, 1).value = label;
    months.forEach((m, j) => {
      const c = ws.getCell(r, 3 + j);
      c.value = f(m);
      c.numFmt = opts.fmt ?? FORMATS.usd;
    });
    if (opts.total !== false) {
      const c = ws.getCell(r, 2);
      c.value = { formula: `SUM(C${r}:${colLetter(2 + months.length)}${r})` };
      c.numFmt = opts.fmt ?? FORMATS.usd;
      c.font = { bold: true };
    }
    r++;
  };
  put('Capitalized costs', (m) => m.costTotal);
  put('Inflow events', (m) => m.inflows);
  put('Equity in — GP (cash)', (m) => m.equityIn.gp);
  put('Equity in — GP (in kind)', (m) => m.equityIn.inKind);
  put('Equity in — LP', (m) => m.equityIn.lp);
  put('Contributions — GP', (m) => m.contributions.gp);
  put('Contributions — LP', (m) => m.contributions.lp);
  put('Land loan draw', (m) => m.landLoanDraw);
  put('Mezzanine draw', (m) => m.mezzDraw);
  put('Construction loan draw', (m) => m.loanDraw);
  put('Capitalized interest', (m) => m.interest);
  put('Construction loan balance', (m) => m.loanBalance, { total: false });
  put('Land loan balance', (m) => m.landLoanBalance, { total: false });
  put('Mezzanine balance', (m) => m.mezzBalance, { total: false });
  put('Gross potential rent', (m) => m.gpr);
  put('Occupancy', (m) => m.occupancy, { total: false, fmt: FORMATS.pct });
  put('Vacancy and credit loss', (m) => m.vacancyAndCreditLoss);
  put('Other income', (m) => m.otherIncome);
  put('Commercial income', (m) => m.commercialIncome);
  put('Effective gross income', (m) => m.egi);
  put('Operating expenses', (m) => m.opexTotal);
  put('Net operating income', (m) => m.noi);
  put('Debt service — interest', (m) => m.debtService.interest);
  put('Debt service — principal', (m) => m.debtService.principal);
  put('Permanent loan balance', (m) => m.permBalance, { total: false });
  put('Refinance net', (m) => m.refinance);
  put('Sale proceeds', (m) => m.saleProceeds);
  put('Cash flow after debt', (m) => m.cashFlowAfterDebt);
  put('Distributions — LP', (m) => m.distributions.lp);
  put('Distributions — GP', (m) => m.distributions.gp);
}

function addLines(ws: ExcelJS.Worksheet, lines: Line[], startRow: number, depth: number): number {
  let r = startRow;
  for (const l of lines) {
    ws.getCell(r, 1).value = `${'    '.repeat(depth)}${l.label}`;
    ws.getCell(r, 2).value = l.amount;
    ws.getCell(r, 2).numFmt = FORMATS.usd;
    ws.getCell(r, 3).value = l.perUnit;
    ws.getCell(r, 3).numFmt = FORMATS.usd;
    ws.getCell(r, 4).value = l.perGSF;
    ws.getCell(r, 4).numFmt = FORMATS.usdCents;
    r++;
    if (l.children) r = addLines(ws, l.children, r, depth + 1);
  }
  return r;
}

function addCapitalBudget(wb: ExcelJS.Workbook, o: DealOutputs) {
  const ws = wb.addWorksheet('Capital budget');
  ws.addRow(['Line', 'Amount', 'Per unit', 'Per GSF']);
  styleHeader(ws.getRow(1));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  ws.getColumn(1).width = 44;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 12;
  let r = 2;
  const subtotalRows: number[] = [];
  for (const g of o.capitalBudget) {
    ws.getCell(r, 1).value = g.label;
    ws.getCell(r, 1).font = { bold: true };
    r++;
    const first = r;
    // Only top-level lines feed the subtotal; children are detail of their parent.
    const topRows: number[] = [];
    for (const l of g.lines) {
      topRows.push(r);
      r = addLines(ws, [l], r, 1);
    }
    ws.getCell(r, 1).value = `Subtotal — ${g.label}`;
    ws.getCell(r, 1).font = { bold: true };
    const c = ws.getCell(r, 2);
    c.value = { formula: topRows.length === r - first ? `SUM(B${first}:B${r - 1})` : topRows.map((x) => `B${x}`).join('+') };
    c.numFmt = FORMATS.usd;
    c.font = { bold: true };
    ws.getCell(r, 3).value = { formula: `B${r}/${o.program.totalUnits}` };
    ws.getCell(r, 3).numFmt = FORMATS.usd;
    ws.getCell(r, 4).value = { formula: `B${r}/${o.program.gsfTotal}` };
    ws.getCell(r, 4).numFmt = FORMATS.usdCents;
    subtotalRows.push(r);
    r += 2;
  }
  ws.getCell(r, 1).value = 'Total project cost';
  ws.getCell(r, 1).font = { bold: true };
  const total = ws.getCell(r, 2);
  total.value = { formula: subtotalRows.map((x) => `B${x}`).join('+') };
  total.numFmt = FORMATS.usd;
  total.font = { bold: true };
  ws.getCell(r, 3).value = { formula: `B${r}/${o.program.totalUnits}` };
  ws.getCell(r, 3).numFmt = FORMATS.usd;
  ws.getCell(r, 4).value = { formula: `B${r}/${o.program.gsfTotal}` };
  ws.getCell(r, 4).numFmt = FORMATS.usdCents;
}

function addSourcesUses(wb: ExcelJS.Workbook, o: DealOutputs) {
  const ws = wb.addWorksheet('Sources & uses');
  ws.addRow(['Sources', 'Amount', 'Per unit', 'Per GSF']);
  styleHeader(ws.getRow(1));
  ws.getColumn(1).width = 48;
  ws.getColumn(2).width = 16;
  ws.getColumn(3).width = 14;
  ws.getColumn(4).width = 12;
  let r = 2;
  const first = r;
  const top: number[] = [];
  for (const l of o.sourcesUses.sources) {
    top.push(r);
    r = addLines(ws, [l], r, 0);
  }
  ws.getCell(r, 1).value = 'Total sources';
  ws.getCell(r, 1).font = { bold: true };
  ws.getCell(r, 2).value = { formula: top.length === r - first ? `SUM(B${first}:B${r - 1})` : top.map((x) => `B${x}`).join('+') };
  ws.getCell(r, 2).numFmt = FORMATS.usd;
  ws.getCell(r, 2).font = { bold: true };
  r++;
  for (const m of o.sourcesUses.memo) {
    ws.getCell(r, 1).value = m.label;
    ws.getCell(r, 2).value = m.amount;
    ws.getCell(r, 2).numFmt = FORMATS.usd;
    ws.getCell(r, 1).font = { italic: true };
    r++;
  }
  r++;
  ws.getCell(r, 1).value = 'Uses';
  styleHeader(ws.getRow(r));
  r++;
  const firstUse = r;
  const topUses: number[] = [];
  for (const l of o.sourcesUses.uses) {
    topUses.push(r);
    r = addLines(ws, [l], r, 0);
  }
  ws.getCell(r, 1).value = 'Total uses';
  ws.getCell(r, 1).font = { bold: true };
  ws.getCell(r, 2).value = { formula: topUses.length === r - firstUse ? `SUM(B${firstUse}:B${r - 1})` : topUses.map((x) => `B${x}`).join('+') };
  ws.getCell(r, 2).numFmt = FORMATS.usd;
  ws.getCell(r, 2).font = { bold: true };
}

function addAmortization(wb: ExcelJS.Workbook, o: DealOutputs) {
  const ws = wb.addWorksheet('Amortization');
  ws.addRow(['Period', 'Beginning balance', 'Payment', 'Interest', 'Principal', 'Ending balance', 'Interest only']);
  styleHeader(ws.getRow(1));
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  [10, 18, 16, 16, 16, 18, 12].forEach((w, i) => (ws.getColumn(i + 1).width = w));
  if (o.amortization.length === 0) {
    ws.addRow(['No permanent loan in this scenario.']);
    return;
  }
  const rate = o.inputs.financing.permanent.ratePct / 12;
  ws.getCell(2, 9).value = 'Monthly rate';
  ws.getCell(2, 10).value = rate;
  ws.getCell(2, 10).numFmt = '0.000000%';
  ws.getCell(3, 9).value = 'Loan';
  ws.getCell(3, 10).value = o.refinance?.loan ?? 0;
  ws.getCell(3, 10).numFmt = FORMATS.usd;
  o.amortization.forEach((row, i) => {
    const r = i + 2;
    ws.getCell(r, 1).value = row.period;
    // Balance roll-forward as formulas: beginning = prior ending; interest = beginning × rate;
    // principal = payment − interest; ending = beginning − principal.
    ws.getCell(r, 2).value = i === 0 ? { formula: '$J$3' } : { formula: `F${r - 1}` };
    ws.getCell(r, 3).value = row.payment;
    ws.getCell(r, 4).value = { formula: `B${r}*$J$2` };
    ws.getCell(r, 5).value = { formula: `C${r}-D${r}` };
    ws.getCell(r, 6).value = { formula: `B${r}-E${r}` };
    ws.getCell(r, 7).value = row.interestOnly ? 'IO' : '';
    for (const c of [2, 3, 4, 5, 6]) ws.getCell(r, c).numFmt = FORMATS.usdCents;
  });
}

function addReturns(wb: ExcelJS.Workbook, d: WorkbookData) {
  const ws = wb.addWorksheet('Returns');
  ws.addRow(['Metric', 'Likely', 'Best', 'Worst']);
  styleHeader(ws.getRow(1));
  ws.getColumn(1).width = 34;
  [2, 3, 4].forEach((c) => (ws.getColumn(c).width = 18));
  const keys: ScenarioKey[] = ['likely', 'best', 'worst'];
  const rows: Array<[string, (o: DealOutputs) => number | null, string]> = [
    ['Unlevered IRR', (o) => o.metrics.unleveredIrr, FORMATS.irr],
    ['Project (levered) IRR', (o) => o.metrics.projectIrr, FORMATS.irr],
    ['LP IRR', (o) => o.metrics.lpIrr, FORMATS.irr],
    ['GP IRR', (o) => o.metrics.gpIrr, FORMATS.irr],
    ['Equity multiple', (o) => o.metrics.equityMultiple, FORMATS.multiple],
    ['LP multiple', (o) => o.metrics.lpMultiple, FORMATS.multiple],
    ['GP multiple', (o) => o.metrics.gpMultiple, FORMATS.multiple],
    ['Yield on cost', (o) => o.metrics.yieldOnCost, FORMATS.pct],
    ['Development spread', (o) => o.metrics.developmentSpread, FORMATS.pct],
    ['Stabilized NOI', (o) => o.metrics.stabilizedNoi, FORMATS.usd],
    ['Total project cost', (o) => o.metrics.totalProjectCost, FORMATS.usd],
    ['Cost per unit', (o) => o.metrics.costPerUnit, FORMATS.usd],
    ['Cost per gross SF', (o) => o.metrics.costPerGSF, FORMATS.usdCents],
    ['Total equity contributed', (o) => o.metrics.totalEquity, FORMATS.usd],
    ['Peak equity', (o) => o.metrics.peakEquity, FORMATS.usd],
    ['Profit', (o) => o.metrics.profit, FORMATS.usd],
    ['Construction loan', (o) => o.metrics.constructionLoan, FORMATS.usd],
    ['Capitalized interest', (o) => o.metrics.capitalizedInterest, FORMATS.usd],
    ['Permanent loan', (o) => o.metrics.permanentLoan, FORMATS.usd],
    ['Sale value', (o) => o.metrics.saleValue, FORMATS.usd],
    ['Net to equity at sale', (o) => o.metrics.netToEquityAtSale, FORMATS.usd],
  ];
  rows.forEach(([label, f, fmt]) => {
    const row = ws.addRow([label, ...keys.map((k) => f(d.outputs[k]))]);
    [2, 3, 4].forEach((c) => (row.getCell(c).numFmt = fmt));
  });
  ws.addRow([]);
  ws.addRow(['DSCR by year (' + d.scenario + ')', ...d.outputs[d.scenario].annual.map((a) => `Year ${a.year}`)]);
  const dscr = ws.addRow(['DSCR', ...d.outputs[d.scenario].annual.map((a) => a.dscr ?? '')]);
  dscr.eachCell((c, i) => {
    if (i > 1) c.numFmt = FORMATS.ratio;
  });
  const coc = ws.addRow(['Cash-on-cash', ...d.outputs[d.scenario].annual.map((a) => a.cashOnCash ?? '')]);
  coc.eachCell((c, i) => {
    if (i > 1) c.numFmt = FORMATS.pct;
  });
}

export function buildWorkbook(d: WorkbookData): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Pencil';
  wb.created = new Date(`${d.version.versionDate}T00:00:00Z`);
  wb.modified = wb.created;
  const o = d.outputs[d.scenario];
  addAssumptions(wb, d);
  addAnnual(wb, o);
  addMonthly(wb, o);
  addCapitalBudget(wb, o);
  addSourcesUses(wb, o);
  addAmortization(wb, o);
  addReturns(wb, d);
  return wb;
}

export async function buildWorkbookBuffer(d: WorkbookData): Promise<Buffer> {
  const wb = buildWorkbook(d);
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
