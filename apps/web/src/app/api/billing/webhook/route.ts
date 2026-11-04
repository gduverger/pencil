import { NextResponse } from 'next/server';
import { applyBillingEvent, billingConfig, subscriptionPeriodEnd, verifyWebhook } from '@/lib/billing';
import { getDb } from '@/lib/db';
import { log } from '@/lib/log';

export const dynamic = 'force-dynamic';

/**
 * Stripe webhook (FR-10.2): `checkout.session.completed` (and the async-payment variant) unlocks a
 * deal or the organization, `invoice.paid` extends Pro on renewal, `customer.subscription.deleted`
 * stops it renewing. The raw body is verified against STRIPE_WEBHOOK_SECRET; a 5xx makes Stripe
 * retry, a duplicate delivery is acknowledged without being applied again.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'billing webhook not configured' }, { status: 503 });
  const payload = await req.text();
  let event;
  try {
    event = verifyWebhook(payload, req.headers.get('stripe-signature'), secret);
  } catch (e) {
    log.warn('billing.webhook.rejected', { message: e instanceof Error ? e.message : String(e) });
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }
  try {
    const result = await applyBillingEvent(await getDb(), event, billingConfig() ? { periodEnd: subscriptionPeriodEnd } : {});
    log.info('billing.event', { eventId: event.id, type: event.type, ...result });
    return NextResponse.json({ received: true, ...result });
  } catch (e) {
    log.error('billing.event.failed', e, { eventId: event.id, type: event.type });
    return NextResponse.json({ error: 'failed' }, { status: 500 });
  }
}
