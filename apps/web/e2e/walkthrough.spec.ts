import { expect, test, type Page } from '@playwright/test';

/**
 * Spec 12.6, steps 1–6 of the nine-step walkthrough (milestone M5): create from a Needham address,
 * accept defaults, change two inputs with notes, elaborate hard cost into three children, add one
 * inflow event, turn commercial on and off. Plus: history is appended on every change and a
 * concurrent edit returns a rev conflict, not a silent overwrite.
 */

async function signIn(page: Page, email: string) {
  await page.goto('/signin');
  await page.getByTestId('dev-email').fill(email);
  await page.getByTestId('dev-signin').click();
  await page.waitForURL(/\/deals/);
}

test.describe('walkthrough steps 1–6', () => {
  test('from a Needham address to elaborated inputs with history and switches', async ({ page }) => {
    await signIn(page, 'alice@example.com');

    // Step 1: new from address. The town resolves; parcel facts are unknown in this environment.
    await page.getByTestId('new-deal').click();
    await page.getByTestId('address').fill('120 Highland Avenue, Needham, MA 02494');
    await page.getByTestId('deal-name').fill('Needham e2e');
    await page.getByTestId('total-units').fill('60');
    await page.getByTestId('land-cost').fill('3000000');
    await page.getByTestId('create-deal').click();
    await page.waitForURL(/\/deals\/[0-9a-f-]+\/inputs/);
    const dealUrl = page.url();
    await expect(page.getByTestId('deal-title')).toHaveText('Needham e2e');

    await page.getByTestId('tab-setup').click();
    await expect(page.getByText('inner-suburbs')).toBeVisible();
    await expect(page.getByTestId('lookup-notes')).toContainText('not loaded');
    await page.goto(dealUrl);

    // Step 2: the twelve inputs, pre-filled (schema defaults with source unknown until benchmarks are seeded).
    await expect(page.getByTestId('row-costs.hard.perGrossSF')).toBeVisible();
    await expect(page.getByTestId('value-costs.hard.perGrossSF')).toHaveValue('350'); // schema default until a benchmark is seeded
    await expect(page.getByTestId('value-site.landCost')).toHaveValue('3000000');
    await expect(page.getByTestId('row-operations.opex.taxesStabilizedAnnual')).toBeVisible();
    await expect(page.getByTestId('source-operations.opex.taxesStabilizedAnnual')).toHaveValue('parcel-data');

    // Change two inputs with notes.
    await page.getByTestId('value-costs.hard.perGrossSF').fill('320');
    await page.getByTestId('value-costs.hard.perGrossSF').press('Enter');
    await expect(page.getByTestId('save-status')).toHaveText(/Saved · rev 2/);
    await page.getByTestId('note-costs.hard.perGrossSF').fill('GC budget 2026-10-15');
    await page.getByTestId('note-costs.hard.perGrossSF').press('Enter');
    await expect(page.getByTestId('save-status')).toHaveText(/Saved · rev 3/);
    await page.getByTestId('source-costs.hard.perGrossSF').selectOption('quote');
    await expect(page.getByTestId('save-status')).toHaveText(/Saved · rev 4/);

    await page.getByTestId('value-exit.exitCapRatePct').fill('5.75');
    await page.getByTestId('value-exit.exitCapRatePct').press('Tab');
    await expect(page.getByTestId('save-status')).toHaveText(/Saved · rev 5/);
    await page.getByTestId('note-exit.exitCapRatePct').fill('Broker opinion, Q3 2026');
    await page.getByTestId('note-exit.exitCapRatePct').press('Enter');
    await expect(page.getByTestId('save-status')).toHaveText(/Saved · rev 6/);

    // History is appended on every change (FR-1.2).
    await page.getByTestId('history-costs.hard.perGrossSF').click();
    const panel = page.getByTestId('history-panel');
    await expect(panel).toBeVisible();
    await expect(panel.getByTestId('history-row')).toHaveCount(4); // created, value, note, source
    await expect(panel).toContainText('GC budget 2026-10-15');
    await panel.getByRole('button', { name: 'Close' }).click();

    // Step 4: elaborate hard cost into three children (the first child creates a remainder).
    await page.getByTestId('elaborate-costs.hard.perGrossSF').click();
    const editor = page.getByTestId('children-costs.hard.perGrossSF');
    await editor.getByTestId('child-label-new').fill('Sitework');
    await editor.getByTestId('child-amount-new').fill('2000000');
    await editor.getByTestId('child-add').click();
    await expect(editor.getByTestId('child-row')).toHaveCount(2);
    await expect(editor).toContainText('auto-balancing remainder');
    await editor.getByTestId('child-label-new').fill('Structure');
    await editor.getByTestId('child-amount-new').fill('10000000');
    await editor.getByTestId('child-add').click();
    await expect(editor.getByTestId('child-row')).toHaveCount(3);
    await expect(page.getByTestId('value-costs.hard.perGrossSF')).toBeDisabled();
    await expect(page.getByTestId('value-costs.hard.perGrossSF')).toHaveValue('320'); // the parent still shows $320/SF: children sum to it
    await expect(page.getByTestId('save-status')).toHaveText(/Saved · rev 8/);

    // Step 5: add one inflow event.
    await page.getByTestId('event-label').fill('Sell relocated house');
    await page.getByTestId('event-month').fill('24');
    await page.getByTestId('event-amount').fill('400000');
    await page.getByTestId('event-kind').selectOption('inflow');
    await page.getByTestId('event-note').fill('Buyer under agreement');
    await page.getByTestId('event-add').click();
    await expect(page.getByTestId('event-row')).toHaveCount(1);
    await expect(page.getByTestId('event-row')).toContainText('inflow');
    await expect(page.getByTestId('save-status')).toHaveText(/Saved · rev 9/);

    // Step 6: turn commercial on (its inputs appear in All inputs mode) and off again (values retained).
    await page.getByTestId('mode-all').click();
    await expect(page.getByTestId('row-program.commercial.grossSF')).toHaveCount(0);
    await page.getByTestId('switch-commercial').check();
    await expect(page.getByTestId('row-program.commercial.grossSF')).toBeVisible();
    await page.getByTestId('value-program.commercial.grossSF').fill('4000');
    await page.getByTestId('value-program.commercial.grossSF').press('Enter');
    await expect(page.getByTestId('save-status')).toHaveText(/Saved · rev 11/);
    await page.getByTestId('switch-commercial').uncheck();
    await expect(page.getByTestId('row-program.commercial.grossSF')).toHaveCount(0);
    await expect(page.getByTestId('save-status')).toHaveText(/Saved · rev 12/);
    await page.reload();
    await page.getByTestId('mode-all').click();
    await page.getByTestId('switch-commercial').check();
    await expect(page.getByTestId('value-program.commercial.grossSF')).toHaveValue('4000');

    // Everything survives a reload (autosave, no manual save).
    await page.reload();
    await expect(page.getByTestId('value-costs.hard.perGrossSF')).toBeDisabled();
    await expect(page.getByTestId('event-row')).toHaveCount(1);
  });

  test('a concurrent edit returns a rev conflict instead of a silent overwrite', async ({ browser }) => {
    const a = await browser.newContext();
    const b = await browser.newContext();
    const pageA = await a.newPage();
    const pageB = await b.newPage();
    await signIn(pageA, 'bob@example.com');
    await pageA.getByTestId('new-deal').click();
    await pageA.getByTestId('address').fill('1 Main Street, Needham, MA');
    await pageA.getByTestId('deal-name').fill('Conflict');
    await pageA.getByTestId('create-deal').click();
    await pageA.waitForURL(/\/inputs/);
    const url = pageA.url();
    await signIn(pageB, 'bob@example.com');
    await pageB.goto(url);
    await expect(pageB.getByTestId('save-status')).toHaveText(/rev 1/);

    await pageA.getByTestId('value-site.landCost').fill('2500000');
    await pageA.getByTestId('value-site.landCost').press('Enter');
    await expect(pageA.getByTestId('save-status')).toHaveText(/Saved · rev 2/);

    await pageB.getByTestId('value-site.landCost').fill('9');
    await pageB.getByTestId('value-site.landCost').press('Enter');
    await expect(pageB.getByTestId('conflict-banner')).toBeVisible();
    await expect(pageB.getByTestId('conflict-banner')).toContainText('revision 2');
    await pageB.reload();
    await expect(pageB.getByTestId('value-site.landCost')).toHaveValue('2500000');
    await a.close();
    await b.close();
  });

  test('sign-in is required for deal screens', async ({ page }) => {
    await page.goto('/deals');
    await expect(page).toHaveURL(/\/signin/);
  });
});
