/*
Functions for interfacing with the purchases functionality.

Some of these are only used by the nextjs app!
*/

import api from "@cocalc/frontend/client/api";
import type { Reason, Service } from "@cocalc/util/db-schema/purchases";
import type { ProjectQuota } from "@cocalc/util/db-schema/purchase-quotas";
import LRU from "lru-cache";
import type { Changes as EditLicenseChanges } from "@cocalc/util/purchases/cost-to-edit-license";
import type { Subscription } from "@cocalc/util/db-schema/subscriptions";
import type { Interval, Statement } from "@cocalc/util/db-schema/statements";

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

export async function getPendingBalance(): Promise<number> {
  return await api("purchases/get-pending-balance");
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

export async function resetClosingDate() {
  return await api("purchases/reset-closing-date");
}

export async function setQuota(
  service: Service,
  value: number,
): Promise<{ global: number; services: { [service: string]: number } }> {
  return await api("purchases/set-quota", { service, value });
}

export async function isPurchaseAllowed(
  service: Service,
  cost?: number,
): Promise<{ allowed: boolean; reason?: string; chargeAmount?: number }> {
  return await api("purchases/is-purchase-allowed", { service, cost });
}

interface PurchasesOptions {
  thisMonth?: boolean; // if true, limit and offset are ignored
  cutoff?: Date; // if given, returns purchases back to this date (limit/offset NOT ignored)
  limit?: number;
  offset?: number;
  service?: Service;
  project_id?: string;
  group?: boolean;
  day_statement_id?: number;
  month_statement_id?: number;
  no_statement?: boolean;
}

export async function getPurchases(opts: PurchasesOptions) {
  return await api("purchases/get-purchases", opts);
}

// Admins can get purchases for any specified user -- error if called by non-admin.
// Same options as getPurchases, but specify the account_id.
export async function getPurchasesAdmin(
  opts: PurchasesOptions & { account_id: string },
) {
  return await api("purchases/get-purchases-admin", opts);
}

export async function getSubscriptions(opts: {
  limit?: number;
  offset?: number;
}): Promise<Subscription[]> {
  return await api("purchases/get-subscriptions", opts);
}

export async function getSubscription(
  subscription_id: number,
): Promise<Subscription> {
  const x = await api("user-query", {
    query: {
      subscriptions: {
        id: subscription_id,
        created: null,
        cost: null,
        interval: null,
        status: null,
        canceled_at: null,
        resumed_at: null,
        current_period_start: null,
        current_period_end: null,
        latest_purchase_id: null,
        metadata: null,
      },
    },
  });
  return x.query.subscriptions;
}

export interface LiveSubscription {
  id: number;
  cost: number;
  status: "unpaid" | "past_due" | "active";
}
export async function getLiveSubscriptions(): Promise<LiveSubscription[]> {
  return await api("purchases/get-live-subscriptions");
}

export async function getStatements(opts: {
  interval: Interval;
  limit?: number;
  offset?: number;
}): Promise<Statement[]> {
  return await api("purchases/get-statements", opts);
}

export async function emailStatement(statement_id: number) {
  return await api("purchases/email-statement", { statement_id });
}

export async function editLicense(opts: {
  license_id: string;
  changes: EditLicenseChanges;
}) {
  return await api("purchases/edit-license", opts);
}

export async function editLicenseOwner(opts: {
  license_id: string;
  new_account_id: string;
}) {
  return await api("purchases/edit-license-owner", opts);
}

export async function getInvoice(invoice_id: string) {
  return await api("billing/get-invoice", { invoice_id });
}

export async function getInvoiceUrl(
  invoice_id: string,
): Promise<string | null> {
  const { url } = await api("billing/get-invoice-url", { invoice_id });
  return url ?? null;
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

export async function setupAutomaticBilling(opts: {
  success_url: string;
  cancel_url?: string;
}): Promise<any> {
  return await api("purchases/setup-automatic-billing", opts);
}

export async function cancelAutomaticBilling() {
  return await api("purchases/cancel-automatic-billing");
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
  quota: ProjectQuota,
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

// returns number of invoices that resulted in new money
export async function syncPaidInvoices(): Promise<number> {
  const { count } = await api("purchases/sync-paid-invoices");
  return count;
}

export async function syncSubscription(): Promise<boolean> {
  const { found } = await api("purchases/sync-subscription");
  return found;
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
  paymentAmount?: number;
}): Promise<
  { done: true } | { done: false; session: { url: string; id: string } }
> {
  return await api("purchases/shopping-cart-checkout", opts);
}

export async function getShoppingCartCheckoutParams() {
  return await api("purchases/get-shopping-cart-checkout-params");
}

import type { WhenPay } from "@cocalc/util/vouchers";

export async function vouchersCheckout(opts: {
  success_url: string;
  cancel_url?: string;
  config: {
    count: number;
    expire: Date;
    active: Date;
    cancelBy: Date;
    title: string;
    whenPay: WhenPay;
    generate: {
      length: number;
      charset: string;
      prefix: string;
      postfix: string;
    };
  };
}): Promise<
  { done: true } | { done: false; session: { url: string; id: string } }
> {
  return await api("purchases/vouchers-checkout", opts);
}

export async function getVoucherCartCheckoutParams(count: number) {
  return await api("purchases/get-vouchers-checkout-params", { count });
}
// get your own min balance
export async function getMinBalance(): Promise<number> {
  return await api("purchases/get-min-balance");
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
  min_balance: number,
) {
  await api("user-query", {
    query: { crm_accounts: { account_id, min_balance } },
  });
}

export async function adminCreateRefund(opts: {
  purchase_id: number;
  reason: Reason;
  notes?: string;
}) {
  return await api("purchases/create-refund", opts);
}

export async function getLicense(license_id: string) {
  return await api("licenses/get-license", { license_id });
}

export async function cancelSubscription({
  subscription_id,
  now,
}: {
  subscription_id: number;
  now?: boolean;
}) {
  return await api("purchases/cancel-subscription", {
    subscription_id,
    now,
  });
}

export async function resumeSubscription(subscription_id: number) {
  return await api("purchases/resume-subscription", {
    subscription_id,
  });
}

export async function renewSubscription(
  subscription_id: number,
): Promise<{ purchase_id: number | null }> {
  return await api("purchases/renew-subscription", {
    subscription_id,
  });
}

export async function studentPay(project_id: string) {
  return await api("purchases/student-pay", { project_id });
}

export async function studentPayLink(
  project_id: string,
): Promise<{ url: string }> {
  return await api("purchases/student-pay-link", { project_id });
}
