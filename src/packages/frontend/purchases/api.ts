/*
Functions for interfacing with the purchases functionality.

Some of these are only used by the nextjs app!
*/

import api0 from "@cocalc/frontend/client/api";
import { send } from "@cocalc/frontend/client/messages";
import type {
  Purchase,
  Reason,
  Service,
} from "@cocalc/util/db-schema/purchases";
import LRU from "lru-cache";
import type { Changes as EditLicenseChanges } from "@cocalc/util/purchases/cost-to-edit-license";
import type { Subscription } from "@cocalc/util/db-schema/subscriptions";
import type { LicenseFromApi } from "@cocalc/util/db-schema/site-licenses";
import type { Interval, Statement } from "@cocalc/util/db-schema/statements";
import { hoursInInterval } from "@cocalc/util/stripe/timecalcs";
import { toDecimal, type MoneyValue } from "@cocalc/util/money";
import type {
  PaymentIntentSecret,
  PaymentIntentCancelReason,
  CheckoutSessionSecret,
  CheckoutSessionOptions,
  CustomerSessionSecret,
  StripeData,
  PaymentMethodData,
  LineItem,
} from "@cocalc/util/stripe/types";
import throttle from "@cocalc/util/api/throttle";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { QUOTA_SPEC } from "@cocalc/util/db-schema/purchase-quotas";

async function api(endpoint: string, args?: object, noThrottle?: boolean) {
  if (!noThrottle) {
    throttle({ endpoint });
  }
  return await api0(endpoint, args);
}

// We cache some results below using this cache, since they are general settings
// that rarely change, and it is nice to not have to worry about how often
// we call them.
const _longCache = new LRU<string, any>({
  ttl: 15 * 60 * 1000,
  max: 100,
});

function longCache(f, name) {
  return reuseInFlight(async (...args) => {
    const key = `${name}-${JSON.stringify(args)}`;
    if (_longCache.has(key)) {
      return _longCache.get(key);
    }
    const value = await f(...args);
    _longCache.set(key, value);
    return value;
  });
}

const _shortCache = new LRU<string, any>({
  ttl: 3 * 1000,
  max: 100,
});

function shortCache(f, name) {
  return reuseInFlight(async (...args) => {
    const key = `${name}-${JSON.stringify(args)}`;
    if (_shortCache.has(key)) {
      return _shortCache.get(key);
    }
    const value = await f(...args);
    _shortCache.set(key, value);
    return value;
  });
}

// getBalance is called a LOT, so we cache the result
// for 5s and reuseinflight.
export const getBalance = shortCache(async (): Promise<MoneyValue> => {
  return await api("purchases/get-balance");
}, "get-balance");

// Admins can get balance for any specified user -- error if called by non-admin.
// account_id is required.
export async function getBalanceAdmin(
  account_id: string,
): Promise<MoneyValue> {
  return await api("purchases/get-balance-admin", { account_id });
}

export async function getSpendRate(): Promise<MoneyValue> {
  return await api("purchases/get-spend-rate");
}

export async function getQuotas(): Promise<{
  minBalance: MoneyValue;
  services: { [service: string]: MoneyValue };
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
): Promise<{ minBalance: MoneyValue; services: { [service: string]: MoneyValue } }> {
  return await api("purchases/set-quota", { service, value });
}

let lastPurchaseAlert = 0;
export async function isPurchaseAllowed(
  service: Service,
  cost?: MoneyValue,
): Promise<{
  allowed: boolean;
  discouraged?: boolean;
  reason?: string;
  chargeAmount?: number;
}> {
  const result = await api("purchases/is-purchase-allowed", { service, cost });
  if (result.allowed && result.discouraged) {
    if (Date.now() - lastPurchaseAlert >= 3000) {
      lastPurchaseAlert = Date.now();
      const display = QUOTA_SPEC[service]?.display ?? service;
      try {
        // fire off a warning to the user so they know they are hitting a budget.
        await send({
          subject: `Budget Alert: ${display}`,
          body: `You recently made a purchase of ${display}.

${result.reason}

<br/>

- [Pay As You Go Budgets](/settings/payg) -- raise your ${display} budget to stop these messages.

- [All Purchases](/settings/purchases)

`,
        });
      } catch (err) {
        console.warn(err);
      }
    }
  }
  return result;
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
  compute_server_id?: number;
}

function parsePurchaseDates(v) {
  for (const x of v.purchases) {
    for (const field of ["time", "period_start", "period_end"]) {
      if (x[field]) {
        x[field] = new Date(x[field]);
      }
    }
  }
  return v;
}

type PurchasesFunction = (
  opts: PurchasesOptions,
) => Promise<{ purchases: Purchase[]; balance: MoneyValue }>;

export const getPurchases: PurchasesFunction = shortCache(
  async (opts: PurchasesOptions) => {
    return parsePurchaseDates(
      await api(
        "purchases/get-purchases",
        opts,
        // do not throttle when getting purchases for a compute server for now.
        !!opts?.compute_server_id,
      ),
    );
  },
  "get-purchases",
);

// Admins can get purchases for any specified user -- error if called by non-admin.
// Same options as getPurchases, but specify the account_id.
export async function getPurchasesAdmin(
  opts: PurchasesOptions & { account_id: string },
): Promise<{ purchases: Purchase[]; balance: MoneyValue }> {
  return parsePurchaseDates(await api("purchases/get-purchases-admin", opts));
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
        payment: null,
      },
    },
  });
  const z = x.query.subscriptions;
  for (const field of [
    "created",
    "canceled_at",
    "resumed_at",
    "current_period_start",
    "current_period_end",
  ]) {
    if (z[field] != null) {
      z[field] = new Date(z[field]);
    }
  }
  const costValue = toDecimal(z.cost ?? 0);
  return {
    ...z,
    cost_per_hour: costValue.div(hoursInInterval(z.interval)).toNumber(),
  };
}

export async function createSubscriptionPayment(subscription_id: number) {
  return await api("purchases/stripe/create-subscription-payment", {
    subscription_id,
  });
}

export interface LiveSubscription {
  id: number;
  cost: MoneyValue;
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
  return (await api("purchases/get-cost-per-day", opts)) as Array<{
    date: string;
    total_cost: MoneyValue;
  }>;
}

// Get all the stripe information about a given user.
export async function getCustomer() {
  return await api("billing/get-customer");
}

// Get this month's outstanding charges by service.
export async function getChargesByService(): Promise<{
  [service: string]: MoneyValue;
}> {
  return (await api("purchases/get-charges-by-service")) as {
    [service: string]: MoneyValue;
  };
}

export async function createPaymentIntent(opts: {
  description: string;
  purpose: string;
  lineItems: LineItem[];
  // admins can optionally set a different user account id to charge them
  user_account_id?: string;
  metadata?: { [key: string]: string };
}): Promise<PaymentIntentSecret> {
  return await api("purchases/stripe/create-payment-intent", opts);
}

export async function processPaymentIntents(): Promise<{ count: number }> {
  return await api("purchases/stripe/process-payment-intents");
}

export async function createSetupIntent(opts: {
  description: string;
}): Promise<{ clientSecret: string }> {
  return await api("purchases/stripe/create-setup-intent", opts);
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
//   service can be an array, in which case returns map from service name to cost.
export const getServiceCost = longCache(async (service: Service) => {
  return await api("purchases/get-service-cost", { service });
}, "get-service-cost");

export const getServiceCosts = longCache(
  async (services: Service[]): Promise<{ [service: string]: any }> => {
    return await api("purchases/get-service-cost", { service: services });
  },
  "get-service-cost",
);

export const getMinimumPayment = longCache(
  async () => (await getServiceCost("credit")) as number,
  "get-minimum-payment",
);

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

export async function shoppingCartCheckout() {
  await api("purchases/shopping-cart-checkout");
}

export async function getShoppingCartCheckoutParams(
  opts: {
    payment_intent?: string;
    processing?: boolean;
  } = {},
) {
  return await api("purchases/get-shopping-cart-checkout-params", opts);
}

export interface MembershipChangeQuote {
  change: "new" | "upgrade" | "downgrade";
  target_class: string;
  target_interval: "month" | "year";
  price: MoneyValue;
  charge: MoneyValue;
  refund: MoneyValue;
  existing_subscription_id?: number;
  existing_class?: string;
  current_period_start?: Date | string;
  current_period_end?: Date | string;
  allowed?: boolean;
  discouraged?: boolean;
  reason?: string;
  charge_amount?: MoneyValue;
}

export async function getMembershipChangeQuote(opts: {
  class: string;
  interval: "month" | "year";
  allow_downgrade?: boolean;
}): Promise<MembershipChangeQuote> {
  return await api("purchases/membership-quote", opts);
}

export async function applyMembershipChange(opts: {
  class: string;
  interval: "month" | "year";
  allow_downgrade?: boolean;
}): Promise<MembershipChangeQuote & { subscription_id: number; purchase_id: number }> {
  return await api("purchases/membership-change", opts);
}

// get your own min balance
export async function getMinBalance(): Promise<MoneyValue> {
  return await api("purchases/get-min-balance");
}

// Get the min balance for user with given account_id.  This is only
// for use by admins.
export async function adminGetMinBalance(
  account_id: string,
): Promise<MoneyValue> {
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

// can get a license by either its full uuid or the subscription_id number,
// if it is provided by a subscription.  In the case of a subscription_id,
// this user has to be a manager of the license.
export async function getLicense(
  opts: { license_id: string } | { subscription_id: number },
): Promise<LicenseFromApi> {
  return await api("licenses/get-license", opts);
}

export async function cancelSubscription({
  subscription_id,
  reason,
}: {
  subscription_id: number;
  reason: string;
}) {
  return await api("purchases/cancel-subscription", {
    subscription_id,
    reason,
  });
}

export async function resumeSubscription(subscription_id: number) {
  return await api("purchases/resume-subscription", {
    subscription_id,
  });
}

export async function costToResumeSubscription(
  subscription_id: number,
): Promise<{ periodicCost: MoneyValue; cost: MoneyValue }> {
  return await api("purchases/cost-to-resume-subscription", {
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

export async function studentPayTransfer(opts: {
  project_id: string;
  paid_project_id: string;
}): Promise<{ url: string }> {
  return await api("purchases/student-pay-transfer", opts);
}

// will give error if user is not signed in - they can't make a purchase anyways in that case.
export async function getStripePublishableKey(): Promise<string> {
  const { stripe_publishable_key } = await api(
    "purchases/get-stripe-publishable-key",
  );
  return stripe_publishable_key as string;
}

export async function cancelPaymentIntent(opts: {
  id: string;
  reason: PaymentIntentCancelReason;
}) {
  await api("purchases/stripe/cancel-payment-intent", opts);
}

export async function getPayments(
  opts: {
    // only admins can use this -- if given, gets the open payments for *that* user.
    user_account_id?: string;
    // the rest of the parameters are EXACTLY as for this api endpoint for stripe
    // with all its quirks:   https://docs.stripe.com/api/payment_intents/list
    created?: string | { gt?: number; gte?: number; lt?: number; lte?: number };
    ending_before?: string;
    starting_after?: string;
    limit?: number;
    // load all unfinished payments -- all other options are ignored
    unfinished?: boolean;
    canceled?: boolean;
  } = {},
): Promise<StripeData> {
  return await api("purchases/stripe/get-payments", opts);
}

export async function getOpenPayments(
  opts: {
    // only admins can use this -- if given, gets the open payments for *that* user.
    user_account_id?: string;
  } = {},
): Promise<StripeData> {
  return await api("purchases/stripe/get-open-payments", opts);
}

export async function getCheckoutSession(
  opts: CheckoutSessionOptions,
): Promise<CheckoutSessionSecret> {
  return await api("purchases/stripe/get-checkout-session", opts);
}

export async function getCustomerSession(): Promise<CustomerSessionSecret> {
  return await api("purchases/stripe/get-customer-session");
}

export async function getPaymentMethod(opts: {
  id: string;
  user_account_id?: string;
}) {
  return await api("purchases/stripe/get-payment-method", opts);
}

export async function getPaymentMethods(
  opts: {
    user_account_id?: string;
    ending_before?: string;
    starting_after?: string;
    limit?: number;
  } = {},
): Promise<PaymentMethodData> {
  return await api("purchases/stripe/get-payment-methods", opts);
}

export async function setDefaultPaymentMethod(opts: {
  // id of a payment method
  default_payment_method: string;
}) {
  return await api("purchases/stripe/set-default-payment-method", opts);
}

export async function deletePaymentMethod(opts: {
  // id of a payment method to delete
  payment_method: string;
}) {
  return await api("purchases/stripe/delete-payment-method", opts);
}

export async function getStripeCustomer() {
  return await api("purchases/stripe/get-customer");
}

export async function setStripeCustomer(changes: {
  name?: string;
  address?;
  email?: string;
}) {
  return await api("purchases/stripe/set-customer", { changes });
}
