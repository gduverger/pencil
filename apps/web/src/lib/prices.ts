/** The two purchases of FR-10.2, as shown in the product (amounts are the spec's; Stripe prices come from the environment). */
export const PRICES = {
  'per-deal': {
    label: 'Unlock this deal',
    amount: '$199 once',
    detail: 'Unlimited exports and share links of this deal for 12 months',
  },
  pro: {
    label: 'Go Pro',
    amount: '$2,400 / year',
    detail:
      'Everything for the organization: exports, shares, letterhead, templates, benchmark detail',
  },
} as const;

export type PurchaseKind = keyof typeof PRICES;
