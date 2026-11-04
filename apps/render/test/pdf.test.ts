import { afterAll, describe, expect, it } from 'vitest';
import { closeSharedBrowser, countPdfPages, htmlToPdf, startServer } from '../src/index';
import { fixtureHtml } from './fixture';

afterAll(async () => {
  await closeSharedBrowser();
});

describe('PDF rendering (spec 8)', () => {
  it('renders the nine-page fixture package to a Letter PDF in under 10 seconds', async () => {
    const html = fixtureHtml();
    await htmlToPdf('<html><body>warm up</body></html>'); // browser launch is not part of the budget
    const start = performance.now();
    const pdf = await htmlToPdf(html, { footerText: 'Needham 60 · Version 3 · 2026-11-04' });
    const elapsed = performance.now() - start;
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(elapsed).toBeLessThan(10_000);
    const pages = countPdfPages(pdf);
    expect(pages).toBeGreaterThanOrEqual(9);
    // Mixed orientation: both Letter portrait (612x792) and landscape (792x612) media boxes appear.
    const text = pdf.toString('latin1');
    expect(text).toMatch(/MediaBox\s*\[\s*0\s+0\s+612\s+792\s*\]/);
    expect(text).toMatch(/MediaBox\s*\[\s*0\s+0\s+792\s+612\s*\]/);
  });

  it('serves PDFs over HTTP with a shared token and rejects bad requests', async () => {
    const { port, close } = await startServer({ port: 0, token: 'secret' });
    try {
      const health = await fetch(`http://127.0.0.1:${port}/healthz`);
      expect(health.status).toBe(200);
      const unauthorized = await fetch(`http://127.0.0.1:${port}/render`, { method: 'POST', body: JSON.stringify({ html: '<p>x</p>' }) });
      expect(unauthorized.status).toBe(401);
      const bad = await fetch(`http://127.0.0.1:${port}/render`, { method: 'POST', headers: { 'x-render-token': 'secret' }, body: JSON.stringify({}) });
      expect(bad.status).toBe(400);
      const ok = await fetch(`http://127.0.0.1:${port}/render`, { method: 'POST', headers: { 'x-render-token': 'secret' }, body: JSON.stringify({ html: '<html><body><section class="page">hello</section></body></html>' }) });
      expect(ok.status).toBe(200);
      expect(ok.headers.get('content-type')).toBe('application/pdf');
      const buf = Buffer.from(await ok.arrayBuffer());
      expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
      const missing = await fetch(`http://127.0.0.1:${port}/nope`);
      expect(missing.status).toBe(404);
    } finally {
      await close();
    }
  });
});
