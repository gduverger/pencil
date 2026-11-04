// @pencil/render — Playwright + Chromium PDF rendering for package pages.
export { htmlToPdf, urlToPdf, htmlToPagePngs, countPdfPages, sharedBrowser, closeSharedBrowser, footerTemplate, PDF_MARGIN } from './pdf';
export type { PdfOptions } from './pdf';
export { createRenderServer, startServer } from './server';
export type { ServerOptions } from './server';
