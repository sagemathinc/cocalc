export interface LineItem {
  amount: number; // amount in US Dollars
  description: string;
}

export interface PaymentIntentSecret {
  clientSecret: string;
  customerSessionClientSecret: string;
}
