// @pencil/exports — XLSX builder (exceljs, real formulas) and the PDF client for apps/render.
export { buildWorkbook, buildWorkbookBuffer, FORMATS } from './xlsx';
export type { WorkbookData } from './xlsx';
export { renderPdf } from './pdf-client';
export type { RenderClientOptions, RenderRequest } from './pdf-client';
