import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// Spec 12.5: render each package page for the fixture deal to PNG and compare against the stored
// snapshot. The first snapshots were reviewed by eye and committed (docs/demos/m4/).
const here = dirname(fileURLToPath(import.meta.url));
const PAGE_KEYS = [
  'summary',
  'returns',
  'sourcesUses',
  'capitalBudget',
  'annualCashFlow',
  'saleAnalysis',
  'sensitivities',
  'assumptions',
  'appendix',
];

function fixtureHtml(): string {
  // The package HTML is produced in a separate Node process (see render-fixture.ts).
  const out = join(here, '..', 'test-results', 'fixture.html');
  execFileSync(process.execPath, ['--import', 'tsx', join(here, 'render-fixture.ts'), out], {
    cwd: join(here, '..'),
    stdio: 'inherit',
    env: { ...process.env, TSX_TSCONFIG_PATH: join(here, '..', 'tsconfig.tsx.json') },
  });
  return readFileSync(out, 'utf8');
}

test.describe('package page snapshots', () => {
  test('every page matches its snapshot', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 1600 });
    await page.setContent(fixtureHtml(), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const pages = page.locator('.page');
    const n = await pages.count();
    expect(n).toBeGreaterThanOrEqual(9);
    const seen = new Set<string>();
    for (let i = 0; i < n; i++) {
      const key = (await pages.nth(i).getAttribute('data-page')) ?? `page-${i}`;
      const name = seen.has(key) ? `${key}-${i}` : key;
      seen.add(key);
      await expect(pages.nth(i)).toHaveScreenshot(`${name}.png`);
    }
    for (const key of PAGE_KEYS) expect(seen.has(key), `page ${key} rendered`).toBe(true);
  });

  test('a share viewer at phone width stays readable', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.setContent(fixtureHtml(), { waitUntil: 'load' });
    const width = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(width).toBeLessThanOrEqual(375);
    await expect(page.locator('.page').first()).toHaveScreenshot('summary-phone.png');
  });
});
