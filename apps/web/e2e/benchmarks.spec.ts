import { expect, test, type Page } from '@playwright/test';

/** Milestone M8: a Needham address resolves the cluster and tax rate; an out-of-range input is flagged. */

async function signIn(page: Page, email: string) {
  await page.goto('/signin');
  await page.getByTestId('dev-email').fill(email);
  await page.getByTestId('dev-signin').click();
  await page.waitForURL(/\/deals/);
}

test('a Needham deal resolves inner-suburbs, defaults from the seeded benchmark, and flags an out-of-range hard cost', async ({
  page,
}) => {
  await signIn(page, 'erin@example.com');
  await page.getByTestId('new-deal').click();
  await page.getByTestId('address').fill('55 Chapel Street, Needham, MA');
  await page.getByTestId('deal-name').fill('Benchmarks e2e');
  await page.getByTestId('total-units').fill('60');
  await page.getByTestId('create-deal').click();
  await page.waitForURL(/\/inputs/);

  // Town cluster and tax rate resolved from the town table.
  await page.getByTestId('tab-setup').click();
  await expect(page.getByText('inner-suburbs')).toBeVisible();
  await page.getByTestId('tab-inputs').click();
  await expect(page.getByTestId('source-operations.opex.taxesStabilizedAnnual')).toHaveValue(
    'parcel-data',
  );
  await expect(page.getByTestId('note-operations.opex.taxesStabilizedAnnual')).toHaveValue(
    /Needham residential rate/,
  );

  // The seeded benchmark (inner-suburbs, wood-frame hard cost 280–360) defaulted the input to its mid with source benchmark.
  await expect(page.getByTestId('value-costs.hard.perGrossSF')).toHaveValue('320');
  await expect(page.getByTestId('source-costs.hard.perGrossSF')).toHaveValue('benchmark');
  await expect(page.getByTestId('row-costs.hard.perGrossSF')).toContainText('$280.00 – $360.00');
  await expect(page.getByTestId('row-costs.hard.perGrossSF')).not.toContainText('outside range');

  // An out-of-range value shows the flag with the range (9.4) and never blocks the run.
  await page.getByTestId('value-costs.hard.perGrossSF').fill('500');
  await page.getByTestId('value-costs.hard.perGrossSF').press('Enter');
  await expect(page.getByTestId('row-costs.hard.perGrossSF')).toContainText('outside range');
  await expect(page.getByText(/1 outside benchmark/)).toBeVisible();
  await page.getByTestId('tab-results').click();
  await expect(page.getByTestId('results-status')).toHaveText(/Live/);

  // The flag reaches the package: the register names the range and the returns page counts it.
  await page.getByTestId('tab-package').click();
  const preview = page.getByTestId('package-preview');
  await expect(preview.locator('[data-page="assumptions"]')).toContainText(
    'above the $280.00–$360.00 range',
  );
  await expect(preview.locator('[data-page="returns"]')).toContainText(
    'Inputs outside their benchmark range: 1',
  );
});

test('the nightly job endpoint requires the secret and reports what it wrote', async ({
  request,
}) => {
  const unauthorized = await request.post('/api/jobs/benchmarks');
  expect(unauthorized.status()).toBe(401);
  const ok = await request.post('/api/jobs/benchmarks?token=e2e-secret');
  expect(ok.status()).toBe(200);
  const body = await ok.json();
  expect(body.ok).toBe(true);
  expect(body.rangesWritten).toBe(0); // no contributions yet
});
