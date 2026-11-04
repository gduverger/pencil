import { expect, test, type Page } from '@playwright/test';

/** Milestone M9: guided intake with confirmation, explain in words, reviewer notes, narrative draft (scripted provider). */

async function signIn(page: Page, email: string) {
  await page.goto('/signin');
  await page.getByTestId('dev-email').fill(email);
  await page.getByTestId('dev-signin').click();
  await page.waitForURL(/\/deals/);
}

test('intake proposes inputs from a conversation and writes them only on confirmation', async ({ page }) => {
  await signIn(page, 'frank@example.com');
  await page.getByTestId('new-deal').click();
  await page.getByTestId('address').fill('9 River Street, Needham, MA');
  await page.getByTestId('deal-name').fill('Assistant e2e');
  await page.getByTestId('create-deal').click();
  await page.waitForURL(/\/inputs/);
  await expect(page.getByTestId('value-site.landCost')).toHaveValue('0');

  await page.getByTestId('assistant-input').fill('We are planning 72 units, wood frame. We have an LOI for the land at $2,500,000 and our GC says $335 per SF.');
  await page.getByTestId('assistant-send').click();
  await expect(page.getByTestId('assistant-assistant').first()).toContainText('confirm each one');
  const proposals = page.getByTestId('assistant-proposals');
  await expect(proposals).toBeVisible();
  await expect(proposals.getByTestId('proposal-program.totalUnits')).toContainText('72');
  await expect(proposals.getByTestId('proposal-site.landCost')).toContainText('2500000');
  await expect(proposals.getByTestId('proposal-costs.hard.perGrossSF')).toContainText('335');
  // Nothing was written before confirmation.
  await expect(page.getByTestId('value-site.landCost')).toHaveValue('0');
  await page.getByTestId('apply-all').click();
  await expect(page.getByTestId('assistant-transcript')).toContainText('Applied:');
  await page.reload();
  await expect(page.getByTestId('value-site.landCost')).toHaveValue('2500000');
  await expect(page.getByTestId('value-program.totalUnits')).toHaveValue('72');
  await expect(page.getByTestId('value-costs.hard.perGrossSF')).toHaveValue('335');
  await expect(page.getByTestId('source-costs.hard.perGrossSF')).toHaveValue('quote');
  await expect(page.getByTestId('note-costs.hard.perGrossSF')).toHaveValue(/confirmed from the assistant/);
  // The transcript is stored with the deal.
  await expect(page.getByTestId('assistant-user')).toContainText('72 units');

  // Explain in words on the Results screen.
  await page.getByTestId('tab-results').click();
  await page.getByTestId('explain-yoc').click();
  await page.getByTestId('explain-words').click();
  await expect(page.getByTestId('explain-sentences')).toContainText('Yield on cost is');
  await expect(page.getByTestId('explain-sentences')).toContainText('Drafted by the assistant');
  await page.getByTestId('explain-panel').getByRole('button', { name: 'Close' }).click();

  // Reviewer notes: the seeded benchmark flags nothing at 335; set 500 to get a flag sentence.
  await page.getByTestId('quick-costs.hard.perGrossSF').fill('500');
  await page.getByTestId('quick-costs.hard.perGrossSF').press('Enter');
  await expect(page.getByTestId('results-status')).toHaveText(/Live/);
  await page.getByTestId('reviewer-notes').click();
  await expect(page.getByTestId('reviewer-list')).toContainText('above the $280.00–$360.00 range');

  // Narrative draft on the Package screen, labeled until edited.
  await page.getByTestId('tab-package').click();
  await page.getByTestId('draft-narrative').click();
  await expect(page.getByTestId('narrative')).toHaveValue(/project IRR ranges from/, { timeout: 30000 });
  await expect(page.getByText('drafted by the assistant').first()).toBeVisible();
  await page.getByTestId('narrative').fill('My own narrative.');
  await page.getByTestId('narrative').blur();
  await expect(page.getByTestId('package-preview')).toContainText('My own narrative.');
});
