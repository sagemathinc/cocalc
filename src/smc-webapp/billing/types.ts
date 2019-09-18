/*
These interfaces are exactly what we **actually use** in our code, not
what stripe actually provides!
*/

import { Map, Set, List } from "immutable";

export type AppliedCoupons = Map<string, any>;

export type CoursePay = Set<string>;

export interface Source {
  id: string;
  brand?: string;
  last4: string;
  exp_year: number;
  exp_month: number;
  name: string;
  address_country: string;
  address_state: string;
  address_zip: string;
}

export interface Plan {
  name: string;
  amount: number;
  currency: string;
  interval_count: number;
  interval: string;
}

export interface Period {
  start: number;
}

export interface InvoiceLine {
  id: string;
  amount: number;
  description: string;
  quantity: number;
  plan: Plan;
  period: Period;
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
    data: InvoiceLine[];
  };
}

export interface Invoices {
  data: Invoice[];
  total_count: number;
}

export interface Customer {
  sources: { data: Source[]; total_count: number };
  subscriptions: { data: Subscription[]; total_count: number };
  default_source: string;
}

export interface Subscription {
  id: string;
  quantity: number;
  cancel_at_period_end: boolean;
  current_period_start: number;
  current_period_end: number;
  plan: Plan;
  status: string;
  start: number;
}

export type PeriodName = "month" | "week" | "year" | "year1" | "month4";
