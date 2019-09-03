export interface Source {
  id: string;
  brand: string;
  last4: string;
  exp_year: number;
  exp_month: number;
  name: string;
  country: string;
  address_state: string;
  address_zip: string;
}

export interface Invoice {
  date: number;
  id: string;
  paid: boolean;
  description: string;
  currency: string;
  amount_due: number;
  tax: number;
  tax_percent: number;
  lines?: {
    data: { id: string; amount: number }[];
  };
}
