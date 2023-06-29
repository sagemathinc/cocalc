/*
Functions for interfacing with the purchases functionality.
*/

import api from "@cocalc/frontend/client/api";
import type { Service } from "@cocalc/util/db-schema/purchases";
import type { ProjectQuota } from "@cocalc/util/db-schema/purchase-quotas";
import LRU from "lru-cache";

// We cache some results below using this cache, since they are general settings
// that rarely change, and it is nice to not have to worry about how often
// we call them.
const cache = new LRU<string, any>({
  ttl: 15 * 60 * 1000,
  max: 100,
});

export async function getBalance(): Promise<number> {
  return await api("purchases/get-balance");
}

export async function getSpendRate(): Promise<number> {
  return await api("purchases/get-spend-rate");
}

export async function getQuotas(): Promise<{
  minBalance: number;
  services: { [service: string]: number };
}> {
  return await api("purchases/get-quotas");
}

export async function getClosingDates(): Promise<{ last: Date; next: Date }> {
  return await api("purchases/get-closing-dates");
}

export async function setQuota(
  service: Service,
  value: number
): Promise<{ global: number; services: { [service: string]: number } }> {
  return await api("purchases/set-quota", { service, value });
}

export async function isPurchaseAllowed(
  service: Service,
  cost?: number
): Promise<{ allowed: boolean; reason?: string }> {
  return await api("purchases/is-purchase-allowed", { service, cost });
}

export async function getPurchases(opts: {
  thisMonth?: boolean; // if true, limit and offset are ignored
  limit?: number;
  offset?: number;
  service?: Service;
  project_id?: string;
  group?: boolean;
}) {
  return await api("purchases/get-purchases", opts);
}

export async function getInvoice(invoice_id: string) {
  return await api("billing/get-invoice", { invoice_id });
}

export async function getCostPerDay(opts: { limit?: number; offset?: number }) {
  return await api("purchases/get-cost-per-day", opts);
}

// Get all the stripe payment info about a given user.
export async function getPaymentMethods() {
  return await api("billing/get-payment-methods");
}

// Get all the stripe information about a given user.
export async function getCustomer() {
  return await api("billing/get-customer");
}

// Get this month's outstanding charges by service.
export async function getChargesByService() {
  return await api("purchases/get-charges-by-service");
}

export async function createCredit(opts: {
  amount: number;
  success_url: string;
  cancel_url?: string;
  description?: string;
}): Promise<any> {
  return await api("purchases/create-credit", opts);
}
export async function getUnpaidInvoices(): Promise<any[]> {
  return await api("purchases/get-unpaid-invoices");
}

// OUTPUT:
//   If service is 'credit', then returns the min allowed credit.
//   If service is 'openai...' it returns an object {prompt_tokens: number; completion_tokens: number} with the current cost per token in USD.
export async function getServiceCost(service: Service): Promise<any> {
  return await api("purchases/get-service-cost", { service });
}

export async function getMinimumPayment(): Promise<number> {
  const key = "getMinimumPayment";
  if (cache.has(key)) {
    return cache.get(key)!;
  }
  const minPayment = (await getServiceCost("credit")) as number;
  cache.set(key, minPayment);
  return minPayment;
}

export async function setPayAsYouGoProjectQuotas(
  project_id: string,
  quota: ProjectQuota
) {
  await api("purchases/set-project-quota", { project_id, quota });
}

export async function getPayAsYouGoMaxProjectQuotas(): Promise<ProjectQuota> {
  const key = "getPayAsYouGoMaxProjectQuotas";
  if (cache.has(key)) {
    return cache.get(key)!;
  }
  const m = await api("purchases/get-max-project-quotas");
  cache.set(key, m);
  return m;
}

export async function getPayAsYouGoPricesProjectQuotas(): Promise<{
  cores: number;
  disk_quota: number;
  memory: number;
  member_host: number;
}> {
  const key = "getPayAsYouGoPricesProjectQuotas";
  if (cache.has(key)) {
    return cache.get(key)!;
  }
  const m = await api("purchases/get-prices-project-quotas");
  cache.set(key, m);
  return m;
}

export async function syncPaidInvoices() {
  await api("purchases/sync-paid-invoices");
}

export async function getCurrentCheckoutSession(): Promise<null | {
  id: string;
  url: string;
}> {
  return (await api("purchases/get-current-checkout-session")).session;
}

export async function cancelCurrentCheckoutSession() {
  await api("purchases/cancel-current-checkout-session");
}

export async function shoppingCartCheckout(opts: {
  success_url: string;
  cancel_url?: string;
}): Promise<
  { done: true } | { done: false; session: { url: string; id: string } }
> {
  return await api("purchases/shopping-cart-checkout", opts);
}

export async function getShoppingCartCheckoutParams() {
  return await api("purchases/get-shopping-cart-checkout-params");
}

// Get the min balance for user with given account_id.  This is only
// for use by admins.
export async function adminGetMinBalance(account_id: string): Promise<number> {
  const x = await api("user-query", {
    query: { crm_accounts: { account_id, min_balance: null } },
  });
  return x.query.crm_accounts.min_balance ?? 0;
}

// Set the min allowed balance of user with given account_id.  This is only
// for use by admins.
export async function adminSetMinBalance(
  account_id: string,
  min_balance: number
) {
  await api("user-query", {
    query: { crm_accounts: { account_id, min_balance } },
  });
}
