export interface LineItem {
  amount: number; // amount in US Dollars
  description: string;
}

export interface PaymentIntentSecret {
  clientSecret: string;
  customerSessionClientSecret?: string;
}

export const PAYMENT_INTENT_REASONS = [
  "duplicate",
  "fraudulent",
  "requested_by_customer",
  "abandoned",
];

export type PaymentIntentCancelReason = (typeof PAYMENT_INTENT_REASONS)[number];
