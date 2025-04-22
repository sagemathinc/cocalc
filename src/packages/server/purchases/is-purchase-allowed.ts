import type { PoolClient } from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import {
  getMaxCost,
  isCoreLanguageModel,
  isLanguageModelService,
  service2model,
} from "@cocalc/util/db-schema/llm-utils";
import {
  QUOTA_SPEC,
  Service,
  isPaygService,
} from "@cocalc/util/db-schema/purchase-quotas";
import { MAX_COST } from "@cocalc/util/db-schema/purchases";
import { currency, round2up, round2down } from "@cocalc/util/misc";
import getBalance from "./get-balance";
import { getTotalChargesThisMonth } from "./get-charges";
import { getPurchaseQuotas } from "./purchase-quotas";
import isBanned from "@cocalc/server/accounts/is-banned";
import { decimalSubtract } from "@cocalc/util/stripe/calc";
import { ALLOWED_SLACK } from "./shopping-cart-checkout";

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

  // if margin is set to a positive number, then the user's balance and all quotas are viewed as
  // increased by this amount when deciding of the purchase is allowed or not.
  margin?: number;
}

// balance, minPayment, amountDue, chargeAmount, total, minBalance

export async function isPurchaseAllowed({
  account_id,
  service,
  cost,
  client,
  margin = 0,
}: Options): Promise<{
  allowed: boolean;
  discouraged?: boolean;
  reason?: string;
  // if purchase is not allowed entirely because balance is too low -- this is how much you must pay,
  // taking into account the configured minPayment. The reason will explain this.
  chargeAmount?: number;
}> {
  if (cost != null && cost >= 0) {
    cost = round2up(cost);
  }
  if (!(await isValidAccount(account_id))) {
    return { allowed: false, reason: `${account_id} is not a valid account` };
  }
  if (await isBanned(account_id)) {
    return { allowed: false, reason: `${account_id} is banned` };
  }
  if (QUOTA_SPEC[service] == null) {
    return {
      allowed: false,
      reason: `unknown service "${service}". The valid services are: ${Object.keys(
        QUOTA_SPEC,
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
  if (cost > MAX_COST) {
    return {
      allowed: false,
      reason: `Cost exceeds the maximum allowed cost of ${currency(
        MAX_COST,
      )}. Please contact support.`,
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
          pay_as_you_go_min_payment,
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
  const { pay_as_you_go_min_payment } = await getServerSettings();

  if (!isPaygService(service)) {
    // for non-PAYG, we only allow credit toward a purchase if your balance is positive.
    const balance = round2down(await getBalance({ account_id, client }));
    const required = round2up(decimalSubtract(cost, Math.max(balance, 0)));
    const chargeAmount =
      required <= 0 ? 0 : Math.max(pay_as_you_go_min_payment, required);
    return {
      // allowed means "without making any payment at all"
      allowed: chargeAmount <= 0,
      chargeAmount,
      reason:
        required < chargeAmount
          ? `The minimum payment is ${currency(
              pay_as_you_go_min_payment,
            )}, so a payment of ${currency(required)} is not allowed.`
          : `Please pay ${currency(chargeAmount)}.`,
    };
  }

  // Below this is payg services only:

  // First check that making purchase won't reduce our balance below the minBalance.
  // Also, we round balance down since fractional pennies don't count, and
  // can cause required to be off by 1 below.
  const balance = round2down(await getBalance({ account_id, client })) + margin;
  const balanceAfterPurchase = balance - cost;
  // add 0.01 due to potential rounding errors
  if (balanceAfterPurchase + 0.01 < minBalance) {
    // You do not have enough money, so obviously deny the purchase.

    const required = round2up(cost - (balance - minBalance));
    const chargeAmount = Math.max(pay_as_you_go_min_payment, required);
    const v: string[] = [];
    if (balance) {
      v.push(`Your Balance: ${currency(round2down(balance))}`);
      v.push(`Required: ${currency(cost)}`);
      if (minBalance) {
        v.push(`Minimum Allowed Balance: ${currency(minBalance)}`);
      }
      if (required < pay_as_you_go_min_payment) {
        v.push(`Minimum Payment: ${currency(pay_as_you_go_min_payment)}`);
      }
    }
    return {
      allowed: false,
      chargeAmount,
      reason: `Please pay ${currency(round2up(chargeAmount))}${
        v.length > 0 ? ": " : ""
      } ${v.join(", ")}`,
    };
  }

  // Below here you have enough money, so everything is allowed, but
  // possibly discouraged.

  // Next check that the quota for the specific service is not exceeded.
  // This is a self-imposed limit by the user to control what they
  // explicitly authorized.
  if (!QUOTA_SPEC[service]?.noSet) {
    const isLLM = QUOTA_SPEC[service]?.category === "ai";
    const defaultQuota = isLLM ? DEFAULT_LLM_QUOTA : 0;
    const quotaForService = (services[service] ?? defaultQuota) + margin;
    if (quotaForService <= 0) {
      return {
        allowed: true,
        discouraged: true,
        reason: `This purchase may exceed your personal monthly spending budget for the "${
          QUOTA_SPEC[service]?.display ?? service
        }" service.  The purchase is still allowed.`,
      };
    }
    // user has set a quota for this service.  is the total unpaid spend within this quota?

    // NOTE: This does NOT involve credits at all.  Even if the user has $10K in credits,
    // they can still limit their monthly spend on a particular service, as a safety.
    const chargesForService = await getTotalChargesThisMonth(
      account_id,
      service,
      client,
    );
    if (chargesForService + cost > quotaForService) {
      return {
        allowed: true,
        discouraged: true,
        reason: `This purchase may exceed your personal monthly spending budget of ${currency(
          quotaForService,
        )} for "${
          QUOTA_SPEC[service]?.display ?? service
        }".  This month you have spent ${currency(chargesForService)} on ${
          QUOTA_SPEC[service]?.display ?? service
        }.`,
      };
    }
  }

  // allowed :-)
  return { allowed: true };
}

interface AssertOptions extends Options {
  // we just successfully captured this amount of money from the user.  For
  // non PAYG purchases, if amount >= cost, then we allow the purchase no
  // matter what the user's balance situation is.
  amount?: number;
}

export async function assertPurchaseAllowed(opts: AssertOptions) {
  const { allowed, reason } = await isPurchaseAllowed(opts);
  if (!allowed) {
    if (
      opts.cost != null &&
      !isPaygService(opts.service) &&
      (opts.amount ?? 0) + ALLOWED_SLACK >= opts.cost
    ) {
      // the cost is explicitly given, it is NOT a PAYG service,
      // and the amount the user just paid us is at least as
      // much as the cost, so we allow it.
      return;
    }
    throw Error(reason);
  }
}

async function getCostEstimate(service: Service): Promise<number | undefined> {
  if (isLanguageModelService(service)) {
    const { pay_as_you_go_openai_markup_percentage } =
      await getServerSettings();
    const model = service2model(service);
    if (isCoreLanguageModel(model)) {
      return getMaxCost(model, pay_as_you_go_openai_markup_percentage);
    } else {
      return undefined;
    }
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
