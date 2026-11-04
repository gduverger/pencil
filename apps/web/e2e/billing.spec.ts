import { createHmac } from 'node:crypto';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';

/**
 * Milestone M10 against the Free-tier server: a Free organization is blocked at export with the
 * upgrade prompt; a (signed, fabricated) Stripe webhook unlocks the deal within one webhook cycle;
 * duplicates and bad signatures are rejected; Pro unlocks every deal and survives cancellation
 * until the paid-through date.
 */

const WEBHOOK_SECRET = 'whsec_e2e';

function signed(payload: string, secret = WEBHOOK_SECRET): string {
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  return `t=${t},v1=${v1}`;
}

async function postEvent(request: APIRequestContext, event: object, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  return request.post('/api/billing/webhook', { headers: { 'content-type': 'application/json', 'stripe-signature': signed(payload, secret) }, data: payload });
}

async function signIn(page: Page, email: string) {
  await page.goto('/signin');
  await page.getByTestId('dev-email').fill(email);
  await page.getByTestId('dev-signin').click();
  await page.waitForURL(/\/deals/);
}

async function newDeal(page: Page, name: string): Promise<string> {
  await page.goto('/deals');
  await page.getByTestId('new-deal').click();
  await page.getByTestId('address').fill('14 Chapel Street, Needham, MA');
  await page.getByTestId('deal-name').fill(name);
  await page.getByTestId('create-deal').click();
  await page.waitForURL(/\/deals\/[^/]+\/inputs/);
  return page.url().match(/\/deals\/([^/]+)\//)![1]!;
}

test('a Free organization is blocked at export and a Stripe webhook unlocks it', async ({ page, request }) => {
  await signIn(page, 'free@example.com');
  await page.goto('/settings');
  await expect(page.getByTestId('org-tier')).toHaveText('free');
  await expect(page.getByTestId('entitlements')).toContainText('No purchases yet');
  const orgId = (await page.getByTestId('org-id').textContent())!.trim();
  expect(orgId).toMatch(/^[0-9a-f-]{36}$/);

  // Blocked at export with the upgrade prompt; the purchase button explains billing is not configured here.
  const dealA = await newDeal(page, 'Gated deal');
  await page.getByTestId('tab-package').click();
  await expect(page.getByTestId('upgrade-prompt')).toBeVisible();
  await expect(page.getByTestId('export-pdf')).toBeDisabled();
  await expect(page.getByTestId('export-xlsx')).toBeDisabled();
  await page.getByTestId('buy-per-deal').click();
  await expect(page.getByTestId('billing-message')).toContainText('not configured');

  // A bad signature is rejected; a missing secret header too.
  const bad = await postEvent(request, { id: 'evt_bad', type: 'checkout.session.completed', data: { object: {} } }, 'whsec_wrong');
  expect(bad.status()).toBe(400);

  // The test purchase: checkout.session.completed for this deal, signed with the webhook secret.
  const purchase = { id: 'evt_e2e_1', type: 'checkout.session.completed', data: { object: { id: 'cs_e2e_1', object: 'checkout.session', mode: 'payment', payment_status: 'paid', customer: 'cus_e2e', client_reference_id: orgId, metadata: { orgId, kind: 'per-deal', dealId: dealA } } } };
  const first = await postEvent(request, purchase);
  expect(first.status()).toBe(200);
  expect(await first.json()).toMatchObject({ received: true, applied: true, kind: 'per-deal', orgId });
  // Redelivery is acknowledged without being applied twice.
  const again = await postEvent(request, purchase);
  expect(await again.json()).toMatchObject({ received: true, applied: false, duplicate: true });

  // Unlocked within one webhook cycle: reload, export, a Version appears.
  await page.reload();
  await expect(page.getByTestId('upgrade-prompt')).toHaveCount(0);
  await expect(page.getByTestId('export-xlsx')).toBeEnabled();
  await page.getByTestId('export-xlsx').click();
  await expect(page.getByTestId('version-1')).toBeVisible({ timeout: 60_000 });
  await page.goto('/settings');
  await expect(page.getByTestId('entitlements')).toContainText('per-deal');

  // Per-deal is scoped to that deal: a second deal is still gated.
  const dealB = await newDeal(page, 'Second deal');
  await page.getByTestId('tab-package').click();
  await expect(page.getByTestId('upgrade-prompt')).toBeVisible();

  // Pro unlocks the organization; cancellation keeps access to the paid-through date.
  const pro = { id: 'evt_e2e_2', type: 'checkout.session.completed', data: { object: { id: 'cs_e2e_2', object: 'checkout.session', mode: 'subscription', payment_status: 'paid', customer: 'cus_e2e', subscription: 'sub_e2e', metadata: { orgId, kind: 'pro', dealId: '' } } } };
  expect(await (await postEvent(request, pro)).json()).toMatchObject({ applied: true, kind: 'pro' });
  await page.reload();
  await expect(page.getByTestId('upgrade-prompt')).toHaveCount(0);
  await expect(page.getByTestId('export-pdf')).toBeEnabled();
  await page.goto('/settings');
  await expect(page.getByTestId('org-tier')).toHaveText('pro');
  const cancelled = { id: 'evt_e2e_3', type: 'customer.subscription.deleted', data: { object: { id: 'sub_e2e', object: 'subscription', customer: 'cus_e2e' } } };
  expect(await (await postEvent(request, cancelled)).json()).toMatchObject({ applied: true });
  await page.reload();
  await expect(page.getByTestId('org-tier')).toHaveText('free');
  await page.goto(`/deals/${dealB}/package`);
  await expect(page.getByTestId('upgrade-prompt')).toHaveCount(0);
});
