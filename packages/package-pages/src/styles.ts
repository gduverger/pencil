/**
 * Package page styles: US Letter pages, portrait by default, landscape where noted (spec 8).
 * The same CSS serves the on-screen package routes and the PDF renderer.
 */
export const PAGE_WIDTH_IN = 8.5;
export const PAGE_HEIGHT_IN = 11;
/** Vertical space reserved for the PDF footer template (page numbers), in inches. */
export const PDF_MARGIN_TOP_IN = 0.3;
export const PDF_MARGIN_BOTTOM_IN = 0.45;

export const PACKAGE_CSS = `
:root {
  --ink: #111111;
  --ink-2: #52514e;
  --ink-3: #8a8884;
  --rule: #d9d7d2;
  --rule-light: #ecebe7;
  --surface: #ffffff;
  --accent: #2a78d6;
  --series-1: #2a78d6;
  --series-2: #eb6834;
  --series-3: #1baf7a;
  --series-4: #eda100;
  --series-5: #e87ba4;
  --series-6: #008300;
  --series-7: #6250d6;
  --series-8: #e34948;
  --flag: #b4530a;
  --flag-bg: #fdf1e7;
  --highlight: #fff4cc;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #e9e8e4; color: var(--ink); }
body.pkg {
  font-family: "Inter", "Helvetica Neue", Arial, sans-serif;
  font-size: 9.5pt;
  line-height: 1.35;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
.pkg-doc { display: flex; flex-direction: column; align-items: center; gap: 0.3in; padding: 0.3in 0; }
.page {
  position: relative;
  width: ${PAGE_WIDTH_IN}in;
  min-height: ${PAGE_HEIGHT_IN - PDF_MARGIN_TOP_IN - PDF_MARGIN_BOTTOM_IN}in;
  background: var(--surface);
  padding: 0.35in 0.5in 0.45in;
  box-shadow: 0 1px 4px rgba(0,0,0,0.12);
  break-after: page;
  overflow: visible;
}
.page.fixed { height: ${PAGE_HEIGHT_IN - PDF_MARGIN_TOP_IN - PDF_MARGIN_BOTTOM_IN}in; overflow: hidden; }
.page.landscape { page: landscape; width: ${PAGE_HEIGHT_IN}in; min-height: ${PAGE_WIDTH_IN - PDF_MARGIN_TOP_IN - PDF_MARGIN_BOTTOM_IN}in; }
.page.landscape.fixed { height: ${PAGE_WIDTH_IN - PDF_MARGIN_TOP_IN - PDF_MARGIN_BOTTOM_IN}in; }
@page { size: letter portrait; margin: 0; }
@page landscape { size: letter landscape; margin: 0; }

.page-header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1.5px solid var(--ink); padding-bottom: 6px; margin-bottom: 12px; }
.page-header .brand { display: flex; align-items: center; gap: 10px; }
.page-header .brand img { max-height: 0.5in; max-width: 2.4in; }
.page-header .brand .org { font-weight: 600; font-size: 11pt; }
.page-header .brand .addr { color: var(--ink-2); font-size: 8pt; }
.page-header .meta { text-align: right; font-size: 8pt; color: var(--ink-2); line-height: 1.3; }
.page-header .meta .deal { font-weight: 600; color: var(--ink); font-size: 10pt; }
.page-title { font-size: 15pt; font-weight: 600; margin: 0 0 8px; letter-spacing: -0.01em; }
.page-subtitle { color: var(--ink-2); margin: -4px 0 10px; font-size: 9pt; }
.page-footer { position: absolute; left: 0.5in; right: 0.5in; bottom: 0.18in; display: flex; justify-content: space-between; font-size: 7.5pt; color: var(--ink-3); border-top: 1px solid var(--rule-light); padding-top: 4px; }
.page:not(.fixed) .page-footer { position: static; margin-top: 14px; }
.footnote { font-size: 7.5pt; color: var(--ink-3); margin: 4px 0 0; }
td.nowrap, th.nowrap { white-space: nowrap; }
.small { font-size: 8pt; color: var(--ink-2); }
h3 { font-size: 10.5pt; margin: 12px 0 4px; font-weight: 600; }
p { margin: 0 0 6px; }
.cols { display: flex; gap: 0.3in; }
.cols > * { flex: 1; min-width: 0; }
.col-narrow { flex: 0 0 2.6in !important; }
.col-wide { flex: 1 1 auto; }

table.t { border-collapse: collapse; width: 100%; font-size: 8.5pt; }
table.t th, table.t td { padding: 2.5px 6px; vertical-align: top; border-bottom: 1px solid var(--rule-light); }
table.t th { text-align: left; font-weight: 600; border-bottom: 1px solid var(--rule); color: var(--ink); }
table.t th.num, table.t td.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
table.t tr.total td { font-weight: 600; border-top: 1px solid var(--ink); border-bottom: none; }
table.t tr.subtotal td { font-weight: 600; background: #f6f5f2; }
table.t tr.group td { font-weight: 600; padding-top: 6px; border-bottom: none; }
table.t td.indent-1 { padding-left: 16px; }
table.t td.indent-2 { padding-left: 28px; }
table.t td.indent-3 { padding-left: 40px; }
table.t.compact th, table.t.compact td { padding: 1.5px 4px; font-size: 7.5pt; }
table.t.dense th, table.t.dense td { padding: 1.5px 3px; font-size: 7pt; }
table.t td.label { color: var(--ink-2); }
table.t .highlight { background: var(--highlight); outline: 1.5px solid var(--ink); outline-offset: -1.5px; font-weight: 600; }
.muted { color: var(--ink-3); }
.flag { color: var(--flag); }
.flag-chip { display: inline-block; background: var(--flag-bg); color: var(--flag); border-radius: 3px; padding: 0 4px; font-size: 7.5pt; }
.hero { display: flex; gap: 10px; margin: 8px 0 10px; }
.hero .tile { flex: 1; border: 1px solid var(--rule); border-radius: 4px; padding: 6px 8px; }
.hero .tile .k { font-size: 7.5pt; color: var(--ink-2); text-transform: uppercase; letter-spacing: 0.04em; }
.hero .tile .v { font-size: 14pt; font-weight: 600; margin-top: 2px; font-variant-numeric: tabular-nums; }
.hero .tile .range { font-size: 7.5pt; color: var(--ink-2); margin-top: 1px; }
.narrative { border-left: 2px solid var(--accent); padding: 2px 10px; margin: 8px 0; font-size: 9.5pt; }
.narrative .label { font-size: 7.5pt; color: var(--ink-3); text-transform: uppercase; letter-spacing: 0.04em; }
.chart { width: 100%; height: auto; display: block; }
.chart text { font-family: inherit; }
.legend { display: flex; flex-wrap: wrap; gap: 10px; font-size: 8pt; color: var(--ink-2); margin: 2px 0 6px; }
.legend .sw { display: inline-block; width: 10px; height: 10px; border-radius: 2px; vertical-align: -1px; margin-right: 4px; }
.cover-note { border: 1px solid var(--rule); padding: 8px 10px; border-radius: 4px; margin: 8px 0; }
.reviewed { font-size: 8.5pt; color: var(--ink-2); margin-top: 6px; }
.facts { display: grid; grid-template-columns: auto 1fr; column-gap: 12px; row-gap: 1px; font-size: 8.5pt; }
.facts dt { color: var(--ink-2); margin: 0; }
.facts dd { margin: 0; font-variant-numeric: tabular-nums; }
.register-section { break-inside: avoid; }
.register-section h3 { margin-top: 10px; }
.stale-note { color: var(--ink-2); font-size: 8.5pt; font-style: italic; }
.heat { color: var(--ink); }
.methodology { font-size: 8.5pt; color: var(--ink-2); }
.methodology li { margin-bottom: 2px; }
@media screen and (max-width: 9in) {
  .pkg-doc { padding: 0; gap: 0; }
  .page, .page.landscape { width: 100%; min-height: 0; height: auto; padding: 16px; box-shadow: none; border-bottom: 8px solid #e9e8e4; }
  .page.fixed, .page.landscape.fixed { height: auto; overflow: visible; }
  .page-footer { position: static; margin-top: 12px; }
  .page-header { flex-wrap: wrap; gap: 6px; }
  .page-header .brand { flex-wrap: wrap; max-width: 100%; min-width: 0; }
  .page-header .brand img { max-width: 100%; height: auto; }
  .page-header .meta { text-align: left; }
  .cols { flex-direction: column; }
  .col-narrow { flex-basis: auto !important; }
  .hero { flex-wrap: wrap; }
  .hero .tile { flex: 1 1 40%; }
  table.t { display: block; overflow-x: auto; }
}
@media print {
  html, body { background: #fff; }
  .pkg-doc { display: block; padding: 0; gap: 0; }
  .page { box-shadow: none; margin: 0; }
  .page-footer { display: none; }
}
`;
