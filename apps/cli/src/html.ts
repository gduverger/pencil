/**
 * Plain HTML package writer for the CLI (milestone M3). Milestone M4 replaces this with the
 * shared React package pages; this file stays as a dependency-free fallback renderer.
 */
import { inputCatalog, getPath, type DealOutputs, type Line, type Group } from '@pencil/engine';
import type { ScenarioKey } from '@pencil/engine';
import { ROUNDING_FOOTNOTE, formatByUnit, formatIrr, formatMultiple, formatPct, formatUsd, formatUsdPerSF, formatUsdWhole } from '@pencil/package-pages/format';

const esc = (s: unknown) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function table(headers: string[], rows: string[][], opts: { numeric?: boolean[]; footnote?: boolean } = {}): string {
  const th = headers.map((h, i) => `<th class="${opts.numeric?.[i] ? 'num' : ''}">${esc(h)}</th>`).join('');
  const body = rows
    .map((r) => `<tr>${r.map((c, i) => `<td class="${opts.numeric?.[i] ? 'num' : ''}">${c}</td>`).join('')}</tr>`)
    .join('\n');
  const foot = opts.footnote === false ? '' : `<p class="footnote">${ROUNDING_FOOTNOTE}</p>`;
  return `<table><thead><tr>${th}</tr></thead><tbody>${body}</tbody></table>${foot}`;
}

function lineRows(lines: Line[], depth = 0): string[][] {
  const rows: string[][] = [];
  for (const l of lines) {
    rows.push([`${'&nbsp;'.repeat(depth * 4)}${esc(l.label)}`, formatUsd(l.amount), formatUsdWhole(l.perUnit), formatUsdPerSF(l.perGSF)]);
    if (l.children) rows.push(...lineRows(l.children, depth + 1));
  }
  return rows;
}

function groupRows(groups: Group[]): string[][] {
  const rows: string[][] = [];
  for (const g of groups) {
    rows.push([`<strong>${esc(g.label)}</strong>`, '', '', '']);
    rows.push(...lineRows(g.lines, 1));
    rows.push([`<em>Subtotal ${esc(g.label)}</em>`, `<em>${formatUsd(g.subtotal)}</em>`, `<em>${formatUsdWhole(g.perUnit)}</em>`, `<em>${formatUsdPerSF(g.perGSF)}</em>`]);
  }
  return rows;
}

export function renderPlainPackage(outputs: Record<ScenarioKey, DealOutputs>, meta: { generatedAt: string; engineVersion: string }): string {
  const likely = outputs.likely;
  const keys: ScenarioKey[] = ['likely', 'best', 'worst'];
  const metricRow = (label: string, f: (o: DealOutputs) => string) => [label, ...keys.map((k) => f(outputs[k]))];
  const headline = table(
    ['Metric', 'Likely', 'Best', 'Worst'],
    [
      metricRow('Project IRR', (o) => formatIrr(o.metrics.projectIrr)),
      metricRow('LP IRR', (o) => formatIrr(o.metrics.lpIrr)),
      metricRow('GP IRR', (o) => formatIrr(o.metrics.gpIrr)),
      metricRow('Unlevered IRR', (o) => formatIrr(o.metrics.unleveredIrr)),
      metricRow('Equity multiple', (o) => formatMultiple(o.metrics.equityMultiple)),
      metricRow('Yield on cost', (o) => formatPct(o.metrics.yieldOnCost)),
      metricRow('Development spread', (o) => formatPct(o.metrics.developmentSpread)),
      metricRow('Total project cost', (o) => formatUsd(o.totals.tpc)),
      metricRow('Cost per unit', (o) => formatUsdWhole(o.metrics.costPerUnit)),
      metricRow('Cost per GSF', (o) => formatUsdPerSF(o.metrics.costPerGSF)),
      metricRow('Peak equity', (o) => formatUsd(o.metrics.peakEquity)),
      metricRow('Profit', (o) => formatUsd(o.metrics.profit)),
      metricRow('Sale value', (o) => formatUsd(o.sale.value)),
      metricRow('Flags', (o) => String(o.flags.length)),
    ],
    { numeric: [false, true, true, true] },
  );

  const su = likely.sourcesUses;
  const sources = table(['Source', 'Amount', 'Per unit', 'Per GSF'], [...lineRows(su.sources), ['<strong>Total sources</strong>', `<strong>${formatUsd(su.totalSources)}</strong>`, '', '']], { numeric: [false, true, true, true] });
  const uses = table(['Use', 'Amount', 'Per unit', 'Per GSF'], [...lineRows(su.uses), ['<strong>Total uses</strong>', `<strong>${formatUsd(su.totalUses)}</strong>`, '', '']], { numeric: [false, true, true, true] });
  const budget = table(['Line', 'Amount', 'Per unit', 'Per GSF'], [...groupRows(likely.capitalBudget), ['<strong>Total project cost</strong>', `<strong>${formatUsd(likely.totals.tpc)}</strong>`, `<strong>${formatUsdWhole(likely.metrics.costPerUnit)}</strong>`, `<strong>${formatUsdPerSF(likely.metrics.costPerGSF)}</strong>`]], { numeric: [false, true, true, true] });

  const years = likely.annual;
  const annualRow = (label: string, f: (y: (typeof years)[number]) => string) => [label, ...years.map(f)];
  const annual = table(
    ['', ...years.map((y) => `Year ${y.year}${y.partial ? ' (sale)' : ''}`)],
    [
      annualRow('Gross potential rent', (y) => formatUsd(y.gpr)),
      annualRow('Vacancy and credit loss', (y) => formatUsd(-y.vacancyAndCreditLoss)),
      annualRow('Other income', (y) => formatUsd(y.otherIncome)),
      annualRow('Commercial income', (y) => formatUsd(y.commercialIncome)),
      annualRow('Effective gross income', (y) => formatUsd(y.egi)),
      annualRow('Operating expenses', (y) => formatUsd(-y.opexTotal)),
      annualRow('Net operating income', (y) => `<strong>${formatUsd(y.noi)}</strong>`),
      annualRow('Debt service — interest', (y) => formatUsd(-y.debtService.interest)),
      annualRow('Debt service — principal', (y) => formatUsd(-y.debtService.principal)),
      annualRow('Cash flow after debt service', (y) => formatUsd(y.cashFlow)),
      annualRow('DSCR', (y) => (y.dscr === null ? '—' : y.dscr.toFixed(2) + 'x')),
      annualRow('Cash-on-cash', (y) => formatPct(y.cashOnCash)),
      annualRow('Distributions to LP', (y) => formatUsd(y.distributions.lp)),
      annualRow('Distributions to GP', (y) => formatUsd(y.distributions.gp)),
    ],
    { numeric: [false, ...years.map(() => true)] },
  );

  const sale = table(
    ['Sale analysis', 'Likely', 'Best', 'Worst'],
    [
      metricRow('Forward 12-month NOI', (o) => formatUsd(o.sale.noiForward)),
      metricRow('Exit cap rate', (o) => formatPct(o.sale.capRate)),
      metricRow('Gross sale value', (o) => formatUsd(o.sale.value)),
      metricRow('Selling costs', (o) => formatUsd(-o.sale.sellingCosts)),
      metricRow('Debt payoff', (o) => formatUsd(-o.sale.payoff)),
      metricRow('Net to equity', (o) => `<strong>${formatUsd(o.sale.netToEquity)}</strong>`),
    ],
    { numeric: [false, true, true, true] },
  );

  const catalog = inputCatalog();
  const registerRows = catalog
    .map((e) => {
      const v = getPath(likely.inputs, e.path);
      if (v === undefined) return null;
      const best = getPath(outputs.best.inputs, e.path);
      const worst = getPath(outputs.worst.inputs, e.path);
      const overrides = [best !== v ? `Best: ${formatByUnit(best, e.unit)}` : '', worst !== v ? `Worst: ${formatByUnit(worst, e.unit)}` : ''].filter(Boolean).join('; ');
      return [esc(e.section), esc(e.label), formatByUnit(v, e.unit), esc(e.path), overrides];
    })
    .filter((r): r is string[] => r !== null);
  const register = table(['Section', 'Input', 'Likely value', 'Path', 'Scenario overrides'], registerRows, { footnote: false });

  const flags = keys.flatMap((k) => outputs[k].flags.map((f) => `<li><strong>${k}</strong>: ${esc(f.message)}${f.path ? ` <code>${esc(f.path)}</code>` : ''}</li>`));

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${esc(likely.inputs.meta.name)} — Pencil package</title>
<style>
body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#111;margin:2rem auto;max-width:72rem;padding:0 1rem;line-height:1.4}
h1{font-size:1.6rem;margin:0}h2{font-size:1.15rem;margin:2rem 0 .5rem;border-bottom:1px solid #ddd;padding-bottom:.25rem}
table{border-collapse:collapse;width:100%;font-size:.85rem;margin-top:.5rem}th,td{padding:.3rem .5rem;border-bottom:1px solid #eee;vertical-align:top}
th{text-align:left;background:#f6f6f6}td.num,th.num{text-align:right;font-variant-numeric:tabular-nums}
.footnote{font-size:.72rem;color:#666;margin:.25rem 0 0}.meta{color:#555;font-size:.9rem}code{font-size:.8em}
@media print{body{margin:0;max-width:none}h2{break-before:page}h2:first-of-type{break-before:auto}}
</style></head><body>
<h1>${esc(likely.inputs.meta.name)}</h1>
<p class="meta">Pencil feasibility package · generated ${esc(meta.generatedAt)} · engine ${esc(meta.engineVersion)} · ${likely.program.totalUnits} units, ${Math.round(likely.program.gsfTotal).toLocaleString('en-US')} GSF · hold ${likely.timeline.S} months</p>
<h2>1. Summary and returns</h2>${headline}
<h2>2. Sources and uses (Likely)</h2>${sources}${uses}
<h2>3. Capital budget (Likely)</h2>${budget}
<h2>4. Annual cash flow (Likely)</h2>${annual}
<h2>5. Sale analysis</h2>${sale}
<h2>6. Flags</h2>${flags.length ? `<ul>${flags.join('')}</ul>` : '<p>None.</p>'}
<h2>7. Assumptions register</h2>${register}
</body></html>`;
}
