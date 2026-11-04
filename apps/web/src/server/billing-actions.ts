'use server';

import { getOrganization } from '@pencil/db';
import { billingConfig, createCheckout, createPortal } from '@/lib/billing';
import { baseUrl } from '@/lib/base-url';
import { getDb } from '@/lib/db';
import { log } from '@/lib/log';
import type { PurchaseKind } from '@/lib/prices';
import { requireUser } from '@/lib/session';

export type CheckoutResult = { ok: true; url: string } | { ok: false; code: 'not-configured' | 'forbidden' | 'error'; message: string };

const NOT_CONFIGURED: CheckoutResult = { ok: false, code: 'not-configured', message: 'Billing is not configured on this server yet (Stripe key and price ids). Results stay available on screen.' };

/** Starts Stripe Checkout for a Per-deal purchase or the Pro subscription; the webhook grants the entitlement. */
export async function startCheckout(kind: PurchaseKind, dealId?: string): Promise<CheckoutResult> {
  const user = await requireUser();
  if (user.role !== 'owner') return { ok: false, code: 'forbidden', message: 'Only an organization owner can purchase; ask yours.' };
  if (!billingConfig()) return NOT_CONFIGURED;
  try {
    const db = await getDb();
    const org = await getOrganization(db, user.orgId);
    const url = await createCheckout({ orgId: user.orgId, email: user.email, customerId: org.stripeCustomerId ?? null, kind, ...(kind === 'per-deal' && dealId ? { dealId } : {}), baseUrl: await baseUrl() });
    if (!url) return NOT_CONFIGURED;
    log.info('billing.checkout.started', { orgId: user.orgId, kind, dealId: dealId ?? null });
    return { ok: true, url };
  } catch (e) {
    log.error('billing.checkout.failed', e, { orgId: user.orgId, kind });
    return { ok: false, code: 'error', message: 'Could not start checkout; try again or contact support.' };
  }
}

/** The Stripe customer portal for invoices and cancellation. */
export async function openBillingPortal(): Promise<CheckoutResult> {
  const user = await requireUser();
  if (user.role !== 'owner') return { ok: false, code: 'forbidden', message: 'Only an organization owner can manage billing.' };
  if (!billingConfig()) return NOT_CONFIGURED;
  try {
    const db = await getDb();
    const org = await getOrganization(db, user.orgId);
    if (!org.stripeCustomerId) return { ok: false, code: 'error', message: 'No purchases yet.' };
    const url = await createPortal(org.stripeCustomerId, `${await baseUrl()}/settings`);
    return url ? { ok: true, url } : NOT_CONFIGURED;
  } catch (e) {
    log.error('billing.portal.failed', e, { orgId: user.orgId });
    return { ok: false, code: 'error', message: 'Could not open the billing portal.' };
  }
}
