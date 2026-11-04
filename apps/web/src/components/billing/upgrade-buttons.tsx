'use client';

/** The two purchases of FR-10.2; Checkout happens on Stripe, the webhook unlocks the deal or organization. */
import { useState } from 'react';
import { Button } from '@/components/ui';
import { PRICES, type PurchaseKind } from '@/lib/prices';
import { startCheckout } from '@/server/billing-actions';

export function UpgradeButtons({ dealId, showPerDeal = Boolean(dealId) }: { dealId?: string; showPerDeal?: boolean }) {
  const [busy, setBusy] = useState<PurchaseKind | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const buy = async (kind: PurchaseKind) => {
    setBusy(kind);
    setMessage(null);
    const r = await startCheckout(kind, kind === 'per-deal' ? dealId : undefined);
    setBusy(null);
    if (r.ok) window.location.assign(r.url);
    else setMessage(r.message);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {showPerDeal && dealId ? (
          <Button size="sm" onClick={() => buy('per-deal')} disabled={busy !== null} data-testid="buy-per-deal" title={PRICES['per-deal'].detail}>
            {busy === 'per-deal' ? 'Opening checkout…' : `${PRICES['per-deal'].label} · ${PRICES['per-deal'].amount}`}
          </Button>
        ) : null}
        <Button size="sm" variant={showPerDeal && dealId ? 'secondary' : 'primary'} onClick={() => buy('pro')} disabled={busy !== null} data-testid="buy-pro" title={PRICES.pro.detail}>
          {busy === 'pro' ? 'Opening checkout…' : `${PRICES.pro.label} · ${PRICES.pro.amount}`}
        </Button>
      </div>
      {message ? (
        <p className="mt-2 text-xs" data-testid="billing-message">
          {message}
        </p>
      ) : null}
    </div>
  );
}
