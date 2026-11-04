/**
 * Entitlement checks (FR-10.2): Free shows results on screen only; Per-deal unlocks exports and
 * shares of one deal for 12 months; Pro unlocks everything for the organization. Outside
 * production, PENCIL_DEFAULT_TIER=pro (the development default) grants Pro so local work and tests
 * are not blocked; milestone M10 wires Stripe and the upgrade prompt.
 */
export interface EntitlementRow {
  kind: string;
  dealId: string | null;
  validUntil: string | null;
}

export function effectiveTier(tier: string): string {
  if (tier !== 'free') return tier;
  const dev =
    process.env.PENCIL_DEFAULT_TIER ?? (process.env.NODE_ENV === 'production' ? 'free' : 'pro');
  return dev;
}

export function hasEntitlement(
  tier: string,
  rows: EntitlementRow[],
  dealId: string,
  now = new Date(),
): boolean {
  if (effectiveTier(tier) === 'pro') return true;
  return rows.some((r) => {
    if (r.validUntil && new Date(r.validUntil).getTime() < now.getTime()) return false;
    if (r.kind === 'pro') return true;
    return r.kind === 'per-deal' && r.dealId === dealId;
  });
}
