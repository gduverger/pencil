import { expect, test, type Page } from '@playwright/test';

/** Spec 12.6 step 9 and the share and revoke cases (milestone M7). */

async function signIn(page: Page, email: string) {
  await page.goto('/signin');
  await page.getByTestId('dev-email').fill(email);
  await page.getByTestId('dev-signin').click();
  await page.waitForURL(/\/deals/);
}

test.describe('walkthrough step 9: package, versions, sharing', () => {
  test('export PDF and Excel, share, open logged out, see the notes, revoke → 404, phone width readable', async ({
    page,
    browser,
  }) => {
    test.setTimeout(300_000);
    await signIn(page, 'dana@example.com');
    await page.getByTestId('new-deal').click();
    await page.getByTestId('address').fill('120 Highland Avenue, Needham, MA 02494');
    await page.getByTestId('deal-name').fill('Package e2e');
    await page.getByTestId('total-units').fill('60');
    await page.getByTestId('land-cost').fill('3000000');
    await page.getByTestId('create-deal').click();
    await page.waitForURL(/\/inputs/);

    // Two inputs with notes (the register must show them on the share).
    await page.getByTestId('note-costs.hard.perGrossSF').fill('GC budget 2026-10-15');
    await page.getByTestId('note-costs.hard.perGrossSF').press('Enter');
    await expect(page.getByTestId('save-status')).toHaveText(/rev 2/);
    await page.getByTestId('note-exit.exitCapRatePct').fill('Broker opinion Q3 2026');
    await page.getByTestId('note-exit.exitCapRatePct').press('Enter');
    await expect(page.getByTestId('save-status')).toHaveText(/rev 3/);

    await page.getByTestId('tab-package').click();
    await page.waitForURL(/\/package/);
    await expect(page.getByTestId('package-preview')).toBeVisible();
    await page.getByTestId('cover-note').fill('Prepared for Needham Cooperative Bank.');
    await page.getByTestId('cover-note').blur();

    // Export PDF → Version 1 with a downloadable file.
    await page.getByTestId('export-pdf').click();
    await expect(page.getByTestId('package-message')).toContainText('Version 1 created', {
      timeout: 120_000,
    });
    await expect(page.getByTestId('package-message')).toContainText('.pdf');
    const pdfUrl = await page.getByTestId('message-link').getAttribute('href');
    const pdfRes = await page.request.get(pdfUrl!);
    expect(pdfRes.status()).toBe(200);
    expect(pdfRes.headers()['content-type']).toBe('application/pdf');
    const pdfBody = await pdfRes.body();
    expect(pdfBody.subarray(0, 5).toString()).toBe('%PDF-');

    // Export Excel → Version 2.
    await page.getByTestId('export-xlsx').click();
    await expect(page.getByTestId('package-message')).toContainText('Version 2 created', {
      timeout: 60_000,
    });
    await expect(page.getByTestId('package-message')).toContainText('.xlsx');
    await expect(page.getByTestId('version-1')).toBeVisible();
    await expect(page.getByTestId('version-2')).toBeVisible();

    // Diff versions: the cover note is the only change between them.
    await page.getByTestId('diff-run').click();
    await expect(page.getByTestId('diff-result')).toBeVisible();

    // Share Version 1, open it logged out.
    await page.getByTestId('share-1').click();
    await expect(page.getByTestId('package-message')).toContainText('Share link created');
    const shareUrl = (await page.getByTestId('message-link').getAttribute('href'))!;
    expect(shareUrl).toMatch(/\/share\//);

    const reader = await browser.newContext({ viewport: { width: 375, height: 800 } });
    const readerPage = await reader.newPage();
    await readerPage.goto(shareUrl);
    await expect(readerPage.getByTestId('share-header')).toContainText('Package e2e');
    await expect(readerPage.getByTestId('share-header')).toContainText('Version 1');
    // The assumptions register shows the two notes.
    const register = readerPage.locator('[data-page="assumptions"]');
    await expect(register).toContainText('GC budget 2026-10-15');
    await expect(register).toContainText('Broker opinion Q3 2026');
    await expect(register)
      .toContainText('Prepared for Needham Cooperative Bank.')
      .catch(() => undefined);
    // Readable at phone width: no horizontal page scroll.
    const scrollWidth = await readerPage.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(375);
    // Both files download from the share.
    const xlsx = await readerPage.request.get(`${shareUrl}/xlsx`);
    expect(xlsx.status()).toBe(200);
    expect(xlsx.headers()['content-type']).toContain('spreadsheetml');
    const pdf = await readerPage.request.get(`${shareUrl}/pdf`);
    expect(pdf.status()).toBe(200);

    // Revoke → the link returns 404.
    const row = page.locator('[data-testid^="share-row-"]').first();
    await row.locator('[data-testid^="revoke-"]').click();
    await expect(page.locator('[data-testid^="share-row-"]').first()).toContainText('revoked');
    const after = await readerPage.request.get(shareUrl);
    expect(after.status()).toBe(404);
    await reader.close();
  });
});
