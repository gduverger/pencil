import { expect, test, type Page } from '@playwright/test';

/** Spec 12.6 steps 7–8 (milestone M6): scenarios and sensitivities, with live results under 200 ms. */

async function signInAndCreate(page: Page, email: string, name: string) {
  await page.goto('/signin');
  await page.getByTestId('dev-email').fill(email);
  await page.getByTestId('dev-signin').click();
  await page.waitForURL(/\/deals/);
  await page.getByTestId('new-deal').click();
  await page.getByTestId('address').fill('120 Highland Avenue, Needham, MA 02494');
  await page.getByTestId('deal-name').fill(name);
  await page.getByTestId('total-units').fill('60');
  await page.getByTestId('land-cost').fill('3000000');
  await page.getByTestId('create-deal').click();
  await page.waitForURL(/\/inputs/);
}

test.describe('walkthrough steps 7–8', () => {
  test('results update live, a Worst override shows beside Likely, and a preset sensitivity runs and goes stale', async ({
    page,
  }) => {
    await signInAndCreate(page, 'carol@example.com', 'Results e2e');
    await page.getByTestId('tab-results').click();
    await page.waitForURL(/\/results/);
    await expect(page.getByTestId('results-status')).toHaveText(/Live/);
    const before = await page.getByTestId('tile-projectIrr').textContent();
    expect(before).toMatch(/%/);

    // Step 3 (live recompute): an input change updates the results within 200 ms of the commit.
    const field = page.getByTestId('quick-costs.hard.perGrossSF');
    await field.fill('250');
    const t0 = Date.now();
    await field.press('Enter');
    await expect(page.getByTestId('tile-projectIrr')).not.toHaveText(before!, { timeout: 2000 });
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(200);
    const after = await page.getByTestId('tile-projectIrr').textContent();
    expect(parseFloat(after!)).toBeGreaterThan(parseFloat(before!)); // cheaper hard cost → higher IRR

    // Step 7: a Worst override. Unedited fields follow Likely; the edited one is marked.
    await page.getByTestId('results-scenario').selectOption('worst');
    const worstField = page.getByTestId('quick-exit.exitCapRatePct');
    await expect(worstField).toHaveValue('5.5');
    await worstField.fill('6.5');
    await worstField.press('Enter');
    await expect(page.getByText('override').first()).toBeVisible();
    await page.getByTestId('compare-toggle').check();
    await expect(page.getByTestId('results-likely')).toBeVisible();
    await expect(page.getByTestId('results-best')).toBeVisible();
    await expect(page.getByTestId('results-worst')).toBeVisible();
    const likelyIrr = await page.getByTestId('tile-projectIrr').textContent();
    const worstIrr = await page.getByTestId('tile-projectIrr-worst').textContent();
    expect(parseFloat(worstIrr!)).toBeLessThan(parseFloat(likelyIrr!));
    await page.getByTestId('compare-toggle').uncheck();
    await page.getByTestId('results-scenario').selectOption('likely');

    // Step 8: run a preset sensitivity; it is saved with the deal and rendered as a heat-shaded grid.
    await page.getByTestId('preset-exitCapXRentGrowth').click();
    const grid = page.getByTestId('grid-exitCapXRentGrowth');
    await expect(grid).toBeVisible({ timeout: 30000 });
    await expect(grid).toHaveAttribute('data-stale', '0');
    await expect(grid.locator('table').first().locator('tbody tr')).toHaveCount(9);
    await expect(grid.locator('.highlight').first()).toBeVisible();

    // Any input change marks the grid stale; re-running clears it.
    await field.fill('260');
    await field.press('Enter');
    await expect(grid).toHaveAttribute('data-stale', '1');
    await expect(page.getByTestId('stale-exitCapXRentGrowth')).toBeVisible();
    await page.getByTestId('rerun-exitCapXRentGrowth').click();
    await expect(page.getByTestId('grid-exitCapXRentGrowth')).toHaveAttribute('data-stale', '0', {
      timeout: 30000,
    });
    await expect(page.getByTestId('fresh-exitCapXRentGrowth')).toBeVisible();

    // Explain-this-number shows the engine trace.
    await page.getByTestId('explain-yoc').click();
    await expect(page.getByTestId('explain-panel')).toContainText('Σ NOI');

    // The grid survives a reload.
    await page.reload();
    await expect(page.getByTestId('grid-exitCapXRentGrowth')).toBeVisible();
    await expect(page.getByTestId('grid-exitCapXRentGrowth')).toHaveAttribute('data-stale', '0');
  });
});
