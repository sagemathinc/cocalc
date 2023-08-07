import type { PoolClient } from "@cocalc/database/pool";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import { getPurchaseQuotas } from "./purchase-quotas";
import getBalance from "./get-balance";
import { getTotalChargesThisMonth } from "./get-charges";
import { Service, QUOTA_SPEC } from "@cocalc/util/db-schema/purchase-quotas";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import { getMaxCost, Model } from "@cocalc/util/db-schema/openai";
import { currency, round2up } from "@cocalc/util/misc";

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
  client?: PoolClient;
}

// balance, minPayment, amountDue, chargeAmount, total, minBalance

export async function isPurchaseAllowed({
  account_id,
  service,
  cost,
  client,
}: Options): Promise<{
  allowed: boolean;
  reason?: string;
  chargeAmount?: number; // if purchase is not allowed entirely because balance is too low -- this is how much you must pay, taking into account the configured minPayment. The reason will explain this.
}> {
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
    if (service == "edit-license") {
      // some services are specially excluded -- TODO: this should be moved to the spec in db-schema
      return { allowed: true };
    }
    return { allowed: false, reason: `cost must be positive` };
  }
  const { services, minBalance } = await getPurchaseQuotas(account_id, client);
  // First check that making purchase won't reduce our balance below the minBalance.
  const balance = await getBalance(account_id, client);
  const amountAfterPurchase = balance - cost;
  // add 0.01 due to potential rounding errors
  if (amountAfterPurchase + 0.01 < minBalance) {
    const { pay_as_you_go_min_payment } = await getServerSettings();
    const required = round2up(cost - (balance - minBalance));
    const chargeAmount = Math.max(pay_as_you_go_min_payment, required);
    return {
      allowed: false,
      chargeAmount,
      reason: `You do not have enough credits to spend up to ${currency(
        cost
      )} since your balance is ${currency(
        balance
      )}, and spending up to ${currency(
        cost
      )} would cause your balance to go below your allowed minimum balance of ${currency(
        minBalance
      )}.  Please add at least ${currency(chargeAmount)} to your account.${
        required < pay_as_you_go_min_payment
          ? " There is a minimum payment of " +
            currency(pay_as_you_go_min_payment) +
            "."
          : ""
      }`,
    };
  }
  // Next check that the quota for the specific service is not exceeded.
  // This is a self-imposed limit by the user to control what they
  // explicitly authorized.
  if (!QUOTA_SPEC[service]?.noSet) {
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
    const chargesForService = await getTotalChargesThisMonth(
      account_id,
      service,
      client
    );
    if (chargesForService + cost > quotaForService) {
      return {
        allowed: false,
        reason: `You need to increase your ${
          QUOTA_SPEC[service]?.display ?? service
        } spending limit (this month charges: ${currency(
          chargesForService
        )}).  Your limit ${currency(quotaForService)} for "${
          QUOTA_SPEC[service]?.display ?? service
        }" is not sufficient to make a purchase of up to ${currency(cost)}.`,
      };
    }
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
