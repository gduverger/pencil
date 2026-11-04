/**
 * Billing (FR-10.2, M10): Stripe Checkout for the Per-deal purchase and the Pro subscription, and
 * the webhook handler that turns Stripe events into `entitlements` rows. Stripe is the only payment
 * UI; this module never stores card data. Event payloads are read defensively (as JSON) so an API
 * version change on Stripe's side cannot break entitlement.
 */
import Stripe from 'stripe';
import {
  addEntitlement,
  billingEventSeen,
  findEntitlementByRef,
  findOrganizationByStripeCustomer,
  recordBillingEvent,
  updateOrganization,
  type Db,
} from '@pencil/db';
import type { PurchaseKind } from './prices';

export interface BillingConfig {
  secretKey: string;
  prices: Record<PurchaseKind, string>;
  webhookSecret: string | null;
}

/** Null until STRIPE_SECRET_KEY and both price ids are set. */
export function billingConfig(): BillingConfig | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  const perDeal = process.env.STRIPE_PRICE_PER_DEAL;
  const pro = process.env.STRIPE_PRICE_PRO;
  if (!secretKey || !perDeal || !pro) return null;
  return {
    secretKey,
    prices: { 'per-deal': perDeal, pro },
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? null,
  };
}

let client: Stripe | null = null;
/** Signature verification needs no key; checkout, portal and subscription reads are only reached when billingConfig() is set. */
export function stripeClient(): Stripe {
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_unset');
  return client;
}

export interface CheckoutArgs {
  orgId: string;
  email: string;
  customerId: string | null;
  kind: PurchaseKind;
  dealId?: string;
  baseUrl: string;
}

/** A Stripe Checkout URL for the purchase, or null when billing is not configured. */
export async function createCheckout(args: CheckoutArgs): Promise<string | null> {
  const cfg = billingConfig();
  if (!cfg) return null;
  const back = args.dealId
    ? `${args.baseUrl}/deals/${args.dealId}/package`
    : `${args.baseUrl}/settings`;
  const metadata = { orgId: args.orgId, kind: args.kind, dealId: args.dealId ?? '' };
  const session = await stripeClient().checkout.sessions.create({
    mode: args.kind === 'pro' ? 'subscription' : 'payment',
    line_items: [{ price: cfg.prices[args.kind], quantity: 1 }],
    success_url: `${back}?billing=success`,
    cancel_url: `${back}?billing=cancel`,
    client_reference_id: args.orgId,
    metadata,
    ...(args.customerId ? { customer: args.customerId } : { customer_email: args.email }),
    ...(args.kind === 'pro'
      ? { subscription_data: { metadata } }
      : args.customerId
        ? {}
        : { customer_creation: 'always' as const }),
  });
  return session.url;
}

/** A Stripe customer-portal URL (invoices, cancel the subscription), or null when billing is not configured. */
export async function createPortal(customerId: string, returnUrl: string): Promise<string | null> {
  if (!billingConfig()) return null;
  const session = await stripeClient().billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

export function verifyWebhook(
  payload: string,
  signature: string | null,
  secret: string,
): Stripe.Event {
  if (!signature) throw new Error('missing stripe-signature header');
  return stripeClient().webhooks.constructEvent(payload, signature, secret);
}

type Obj = Record<string, unknown>;
const obj = (o: Obj | undefined, k: string): Obj | undefined => {
  const v = o?.[k];
  return v && typeof v === 'object' ? (v as Obj) : undefined;
};
/** A string field, or the id of an expanded object in that field. */
const str = (o: Obj | undefined, k: string): string | null => {
  const v = o?.[k];
  if (typeof v === 'string') return v;
  const id = obj(o, k)?.id;
  return typeof id === 'string' ? id : null;
};
const num = (o: Obj | undefined, k: string): number | null =>
  typeof o?.[k] === 'number' ? (o[k] as number) : null;

export function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/** The end of the current paid period of a subscription (items carry it on current API versions). */
export async function subscriptionPeriodEnd(subscriptionId: string): Promise<Date | null> {
  const sub = (await stripeClient().subscriptions.retrieve(subscriptionId)) as unknown as Obj;
  const items = obj(sub, 'items');
  const first = Array.isArray(items?.data) ? (items.data[0] as Obj | undefined) : undefined;
  const end = num(first, 'current_period_end') ?? num(sub, 'current_period_end');
  return end ? new Date(end * 1000) : null;
}

export interface BillingEvent {
  id: string;
  type: string;
  data: { object: unknown };
}

export interface AppliedEvent {
  applied: boolean;
  duplicate?: boolean;
  orgId?: string;
  kind?: string;
  note?: string;
}

/**
 * Turns one Stripe event into entitlement rows. Idempotent: an event id is applied once, and a
 * checkout session, subscription or invoice produces at most one row. Per-deal purchases unlock
 * one deal for 12 months; Pro sets the organization tier and is extended on every paid renewal;
 * a cancelled subscription stops renewing but access runs to the paid-through date.
 */
export async function applyBillingEvent(
  db: Db,
  event: BillingEvent,
  deps: { periodEnd?: (subscriptionId: string) => Promise<Date | null>; now?: Date } = {},
): Promise<AppliedEvent> {
  if (await billingEventSeen(db, event.id)) return { applied: false, duplicate: true };
  const now = deps.now ?? new Date();
  const o = (event.data.object ?? {}) as Obj;
  const result = await (async (): Promise<AppliedEvent> => {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded': {
        if (str(o, 'payment_status') !== 'paid')
          return { applied: false, note: 'payment not complete' };
        const meta = obj(o, 'metadata');
        const orgId = str(meta, 'orgId') ?? str(o, 'client_reference_id');
        const kind = str(meta, 'kind');
        const dealId = str(meta, 'dealId') || null;
        const sessionId = str(o, 'id');
        if (!orgId || !sessionId || (kind !== 'per-deal' && kind !== 'pro'))
          return { applied: false, note: 'missing metadata' };
        if (kind === 'per-deal' && !dealId)
          return { applied: false, note: 'per-deal purchase without a deal' };
        const subscriptionId = str(o, 'subscription');
        const ref = kind === 'pro' ? (subscriptionId ?? sessionId) : sessionId;
        if (await findEntitlementByRef(db, ref))
          return { applied: false, duplicate: true, orgId, kind };
        let validUntil = addMonths(now, 12);
        if (kind === 'pro' && subscriptionId && deps.periodEnd) {
          try {
            validUntil = (await deps.periodEnd(subscriptionId)) ?? validUntil;
          } catch {
            /* keep the 12-month default; the renewal invoice corrects it */
          }
        }
        await addEntitlement(db, {
          orgId,
          dealId: kind === 'per-deal' ? dealId : null,
          kind,
          validUntil: validUntil.toISOString(),
          stripeRef: ref,
        });
        const customer = str(o, 'customer');
        await updateOrganization(db, orgId, {
          ...(customer ? { stripeCustomerId: customer } : {}),
          ...(kind === 'pro' ? { tier: 'pro' } : {}),
        });
        return { applied: true, orgId, kind };
      }
      case 'invoice.paid': {
        if (str(o, 'billing_reason') !== 'subscription_cycle')
          return { applied: false, note: 'not a renewal' };
        const customer = str(o, 'customer');
        const org = customer ? await findOrganizationByStripeCustomer(db, customer) : null;
        if (!org) return { applied: false, note: 'unknown customer' };
        const invoiceId = str(o, 'id');
        if (!invoiceId) return { applied: false, note: 'invoice without id' };
        if (await findEntitlementByRef(db, invoiceId))
          return { applied: false, duplicate: true, orgId: org.id, kind: 'pro' };
        const lines = obj(o, 'lines');
        const data = Array.isArray(lines?.data) ? (lines.data as Obj[]) : [];
        const end = data
          .map((l) => num(obj(l, 'period'), 'end'))
          .find((n): n is number => n !== null);
        const validUntil = end ? new Date(end * 1000) : addMonths(now, 12);
        await addEntitlement(db, {
          orgId: org.id,
          dealId: null,
          kind: 'pro',
          validUntil: validUntil.toISOString(),
          stripeRef: invoiceId,
        });
        await updateOrganization(db, org.id, { tier: 'pro' });
        return { applied: true, orgId: org.id, kind: 'pro' };
      }
      case 'customer.subscription.deleted': {
        const customer = str(o, 'customer');
        const org = customer ? await findOrganizationByStripeCustomer(db, customer) : null;
        if (!org) return { applied: false, note: 'unknown customer' };
        await updateOrganization(db, org.id, { tier: 'free' });
        return {
          applied: true,
          orgId: org.id,
          kind: 'pro',
          note: 'subscription ended; access runs to the paid-through date',
        };
      }
      default:
        return { applied: false, note: `ignored ${event.type}` };
    }
  })();
  await recordBillingEvent(db, event.id, event.type);
  return result;
}
