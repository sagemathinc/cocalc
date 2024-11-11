export interface LineItem {
  amount: number; // amount in US Dollars
  description: string;
  tax?: boolean; // if true, this line item represents tax
  extra?: boolean; // if true, should render as an "extra" line item at the bottom, e.g., "Total" on a receipt. Mainly for rendering invoices, etc.
  bold?: boolean; // purely for rendering
}

export interface PaymentIntentSecret {
  clientSecret: string;
  customerSessionClientSecret?: string;
}

export interface CheckoutSessionSecret {
  clientSecret: string;
}

export interface CustomerSessionSecret {
  customerSessionClientSecret?: string;
}

export const PAYMENT_INTENT_REASONS = [
  "duplicate",
  "fraudulent",
  "requested_by_customer",
  "abandoned",
];

export type PaymentIntentCancelReason = (typeof PAYMENT_INTENT_REASONS)[number];

export interface CheckoutSessionOptions {
  // unique for open payments - short unique string describing where/what payment is
  purpose: string;
  // string to show to the user
  description: string;
  // what is being purchased
  lineItems: LineItem[];
  return_url?: string;
  // optional extra metadata: MUST NOT use 'purpose', 'account_id',
  // 'confirm' or 'processed' as key.  as a key.
  metadata?: { [key: string]: string };
}

export interface StripeData {
  has_more: boolean;
  data: any[];
  object: "list";
  url?: string;
}

export interface PaymentMethodData extends StripeData {
  default_payment_method?: string;
}
