import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import { getPurchaseQuotas } from "./purchase-quotas";
import getBalance from "./get-balance";
import { getTotalChargesThisMonth } from "./get-charges";
import { Service, QUOTA_SPEC } from "@cocalc/util/db-schema/purchase-quotas";
import { currency } from "./util";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import { getMaxCost, Model } from "@cocalc/util/db-schema/openai";

// Throws an exception if purchase is not allowed.  Code should
// call this before giving the thing and doing createPurchase.
// This is NOT part of createPurchase, since we could easily call
// createPurchase after providing the service.
// NOTE: user is not supposed to ever see these errors, in that the
// frontend should do the same checks and present an error there.
// This is a backend safety check.
interface Options {
  account_id: string;
  service: Service;
  cost?: number;
}

export async function isPurchaseAllowed({
  account_id,
  service,
  cost,
}: Options): Promise<{ allowed: boolean; reason?: string }> {
  if (!(await isValidAccount(account_id))) {
    return { allowed: false, reason: `${account_id} is not a valid account` };
  }
  if (QUOTA_SPEC[service] == null) {
    return {
      allowed: false,
      reason: `unknown service "${service}". The valid services are: ${Object.keys(
        QUOTA_SPEC
      ).join(", ")}`,
    };
  }
  if (cost == null) {
    cost = await getCostEstimate(service);
  }
  if (cost == null) {
    return {
      allowed: false,
      reason: `cost estimate for service "${service}" not implemented`,
    };
  }
  if (!Number.isFinite(cost)) {
    return { allowed: false, reason: `cost must be finite` };
  }
  if (service == "credit") {
    const { pay_as_you_go_min_payment } = await getServerSettings();
    if (cost > -pay_as_you_go_min_payment) {
      return {
        allowed: false,
        reason: `must credit account with at least ${currency(
          pay_as_you_go_min_payment
        )}, but you're trying to credit ${currency(-cost)}`,
      };
    }
    return { allowed: true };
  }

  if (cost <= 0) {
    // credit is specially excluded
    return { allowed: false, reason: `cost must be positive` };
  }
  const { services, global } = await getPurchaseQuotas(account_id);
  // First check that the overall quota is not exceeded
  const balance = await getBalance(account_id);
  if (balance + cost > global.quota) {
    return {
      allowed: false,
      reason: `This purchase would potentially exceed your spending limit (${currency(
        balance
      )} + ${currency(cost)} > ${currency(
        global.quota
      )}).  Add credit, increase your spending limit, or contact support.`,
    };
  }
  // Next check that the quota for the specific service is not exceeded.
  // This is a self-imposed limit by the user to control what they
  // explicitly authorized.
  const quotaForService = services[service];
  if (!quotaForService) {
    return {
      allowed: false,
      reason: `Please set a spending limit for the "${
        QUOTA_SPEC[service]?.display ?? service
      }" service.`,
    };
  }
  // user has set a quota for this service.  is the total unpaid spend within this quota?

  // NOTE: This does NOT involve credits at all.  Even if the user has $10K in credits,
  // they can still limit their monthly spend on a particular service, as a safety.
  const chargesForService = await getTotalChargesThisMonth(account_id, service);
  if (chargesForService + cost > quotaForService) {
    return {
      allowed: false,
      reason: `You need to increase your ${
        QUOTA_SPEC[service]?.display ?? service
      } spending limit or reduce your balance (this month charges: ${currency(
        chargesForService
      )}).  Your limit ${currency(quotaForService)} for "${
        QUOTA_SPEC[service]?.display ?? service
      }" is not sufficient to make a purchase of up to ${currency(cost)}.`,
    };
  }

  // allowed :-)
  return { allowed: true };
}

export async function assertPurchaseAllowed(opts: Options) {
  const { allowed, reason } = await isPurchaseAllowed(opts);
  if (!allowed) {
    throw Error(reason);
  }
}

async function getCostEstimate(service: Service): Promise<number | undefined> {
  if (service?.startsWith("openai-")) {
    const { pay_as_you_go_openai_markup_percentage } =
      await getServerSettings();
    const model = service.slice(7) as Model;
    return getMaxCost(model, pay_as_you_go_openai_markup_percentage);
  }

  switch (service) {
    case "credit":
      const { pay_as_you_go_min_payment } = await getServerSettings();
      return -pay_as_you_go_min_payment;
    default:
      return undefined;
  }
  return undefined;
}
