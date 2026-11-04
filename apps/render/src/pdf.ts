/**
 * HTML → PDF with headless Chromium (spec 8). Pages are US Letter; landscape pages are declared
 * by the package CSS through a named @page rule, which Chromium honors with preferCSSPageSize.
 * Page numbers and the rounding footnote go in the PDF footer template so flowing pages
 * (register, capital budget) number correctly.
 */
import { chromium, type Browser } from 'playwright';

export interface PdfOptions {
  /** Footer left text (deal name · version); the page counter is always on the right. */
  footerText?: string;
  /** Wait for web fonts before printing (default true). */
  waitForFonts?: boolean;
  /** Reuse a browser across calls. */
  browser?: Browser;
}

export const PDF_MARGIN = { top: '0.3in', bottom: '0.45in', left: '0', right: '0' } as const;

let shared: Promise<Browser> | null = null;

/** A lazily launched browser shared by the server and tests. */
export function sharedBrowser(): Promise<Browser> {
  if (!shared) {
    shared = chromium.launch({ args: ['--no-sandbox', '--font-render-hinting=none'] }).then((b) => {
      b.on('disconnected', () => {
        shared = null;
      });
      return b;
    });
  }
  return shared;
}

export async function closeSharedBrowser(): Promise<void> {
  if (shared) {
    const b = await shared;
    shared = null;
    await b.close();
  }
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function footerTemplate(text: string): string {
  return `<div style="width:100%;font-family:Inter,'Helvetica Neue',Arial,sans-serif;font-size:7pt;color:#8a8884;padding:0 0.5in;display:flex;justify-content:space-between;align-items:center;">
<span>${esc(text)}</span>
<span>Figures rounded; totals may not foot. &nbsp;·&nbsp; Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
</div>`;
}

export async function htmlToPdf(html: string, opts: PdfOptions = {}): Promise<Buffer> {
  const browser = opts.browser ?? (await sharedBrowser());
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    if (opts.waitForFonts !== false)
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footerTemplate(opts.footerText ?? ''),
      margin: PDF_MARGIN,
    });
    return Buffer.from(pdf);
  } finally {
    await context.close();
  }
}

/** Render a URL (the web app's package route) rather than inline HTML. */
export async function urlToPdf(
  url: string,
  opts: PdfOptions & { headers?: Record<string, string> } = {},
): Promise<Buffer> {
  const browser = opts.browser ?? (await sharedBrowser());
  const context = await browser.newContext({ extraHTTPHeaders: opts.headers });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    if (opts.waitForFonts !== false)
      await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await page.emulateMedia({ media: 'print' });
    const pdf = await page.pdf({
      preferCSSPageSize: true,
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footerTemplate(opts.footerText ?? ''),
      margin: PDF_MARGIN,
    });
    return Buffer.from(pdf);
  } finally {
    await context.close();
  }
}

/** Screenshot every `.page` element of a package HTML, in order (used by the snapshot tests and demos). */
export async function htmlToPagePngs(
  html: string,
  opts: { browser?: Browser; scale?: number } = {},
): Promise<Buffer[]> {
  const browser = opts.browser ?? (await sharedBrowser());
  const context = await browser.newContext({
    deviceScaleFactor: opts.scale ?? 1,
    viewport: { width: 1200, height: 1600 },
  });
  try {
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const pages = page.locator('.page');
    const n = await pages.count();
    const out: Buffer[] = [];
    for (let i = 0; i < n; i++)
      out.push(Buffer.from(await pages.nth(i).screenshot({ type: 'png' })));
    return out;
  } finally {
    await context.close();
  }
}

/** Count pages in a PDF buffer without a PDF library (the /Type /Page objects, not /Pages). */
export function countPdfPages(pdf: Buffer): number {
  const text = pdf.toString('latin1');
  const matches = text.match(/\/Type\s*\/Page(?![s])/g);
  return matches ? matches.length : 0;
}
