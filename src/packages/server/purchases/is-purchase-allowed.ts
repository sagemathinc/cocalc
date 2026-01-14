import type { PoolClient } from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import isBanned from "@cocalc/server/accounts/is-banned";
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
import {
  moneyRound2Down,
  moneyRound2Up,
  moneyToCurrency,
  toDecimal,
  type MoneyValue,
} from "@cocalc/util/money";
import getBalance from "./get-balance";
import { getTotalChargesThisMonth } from "./get-charges";
import { getPurchaseQuotas } from "./purchase-quotas";
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
  cost?: MoneyValue;
  client?: PoolClient;

  // if margin is set to a positive number, then the user's balance and all quotas are viewed as
  // increased by this amount when deciding of the purchase is allowed or not.
  margin?: MoneyValue;
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
  const max = (a, b) => (a.gt(b) ? a : b);
  if (typeof cost === "number" && !Number.isFinite(cost)) {
    return { allowed: false, reason: `cost must be finite` };
  }
  const marginValue = toDecimal(margin);
  let costValue = cost != null ? toDecimal(cost) : undefined;
  if (costValue != null && costValue.gte(0)) {
    costValue = moneyRound2Up(costValue);
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
  if (costValue == null) {
    const estimate = await getCostEstimate(service);
    costValue = estimate == null ? undefined : toDecimal(estimate);
  }
  if (costValue == null) {
    return {
      allowed: false,
      reason: `cost estimate for service "${service}" not implemented`,
    };
  }
  if (costValue.gt(MAX_COST)) {
    return {
      allowed: false,
      reason: `Cost exceeds the maximum allowed cost of ${moneyToCurrency(
        MAX_COST,
      )}. Please contact support.`,
    };
  }
  if (!Number.isFinite(costValue.toNumber())) {
    return { allowed: false, reason: `cost must be finite` };
  }
  if (service == "credit") {
    const { pay_as_you_go_min_payment } = await getServerSettings();
    const minPayment = toDecimal(pay_as_you_go_min_payment ?? 0);
    if (costValue.gt(minPayment.neg())) {
      return {
        allowed: false,
        reason: `must credit account with at least ${moneyToCurrency(
          minPayment,
        )}, but you're trying to credit ${moneyToCurrency(costValue.neg())}`,
      };
    }
    return { allowed: true };
  }

  if (costValue.lte(0)) {
    return { allowed: false, reason: `cost must be positive` };
  }
  const { services, minBalance } = await getPurchaseQuotas(account_id, client);
  const { pay_as_you_go_min_payment, llm_default_quota } =
    await getServerSettings();
  const minPayment = toDecimal(pay_as_you_go_min_payment ?? 0);

  if (!isPaygService(service)) {
    // for non-PAYG, we only allow credit toward a purchase if your balance is positive.
    const balance = moneyRound2Down(toDecimal(await getBalance({ account_id, client })));
    const required = moneyRound2Up(
      costValue.sub(balance.gt(0) ? balance : toDecimal(0)),
    );
    const chargeAmount = required.lte(0)
      ? toDecimal(0)
      : max(minPayment, required);
    return {
      // allowed means "without making any payment at all"
      allowed: chargeAmount.lte(0),
      chargeAmount: chargeAmount.toNumber(),
      reason:
        required.lt(chargeAmount)
          ? `The minimum payment is ${moneyToCurrency(
              minPayment,
            )}, so a payment of ${moneyToCurrency(required)} is not allowed.`
          : `Please pay ${moneyToCurrency(chargeAmount)}.`,
    };
  }

  // Below this is payg services only:

  // First check that making purchase won't reduce our balance below the minBalance.
  // Also, we round balance down since fractional pennies don't count, and
  // can cause required to be off by 1 below.
  const balance = moneyRound2Down(toDecimal(await getBalance({ account_id, client }))).add(
    marginValue,
  );
  const balanceAfterPurchase = balance.sub(costValue);
  // add 0.01 due to potential rounding errors
  const minBalanceValue = toDecimal(minBalance);
  if (balanceAfterPurchase.add("0.01").lt(minBalanceValue)) {
    // You do not have enough money, so obviously deny the purchase.

    const required = moneyRound2Up(
      costValue.sub(balance.sub(minBalanceValue)),
    );
    const chargeAmount = max(minPayment, required);
    const v: string[] = [];
    if (!balance.eq(0)) {
      v.push(`Your Balance: ${moneyToCurrency(moneyRound2Down(balance))}`);
      v.push(`Required: ${moneyToCurrency(costValue)}`);
      if (!minBalanceValue.eq(0)) {
        v.push(`Minimum Allowed Balance: ${moneyToCurrency(minBalanceValue)}`);
      }
      if (required.lt(minPayment)) {
        v.push(`Minimum Payment: ${moneyToCurrency(minPayment)}`);
      }
    }
    return {
      allowed: false,
      chargeAmount: chargeAmount.toNumber(),
      reason: `Please pay ${moneyToCurrency(moneyRound2Up(chargeAmount))}${
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
    const defaultQuota = isLLM ? llm_default_quota : 0;
    const quotaForService = toDecimal(services[service] ?? defaultQuota).add(
      marginValue,
    );
    if (quotaForService.lte(0)) {
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
    if (toDecimal(chargesForService).add(costValue).gt(quotaForService)) {
      return {
        allowed: true,
        discouraged: true,
        reason: `This purchase may exceed your personal monthly spending budget of ${moneyToCurrency(
          quotaForService,
        )} for "${
          QUOTA_SPEC[service]?.display ?? service
        }".  This month you have spent ${moneyToCurrency(chargesForService)} on ${
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
  amount?: MoneyValue;
}

export async function assertPurchaseAllowed(opts: AssertOptions) {
  const { allowed, reason } = await isPurchaseAllowed(opts);
  if (!allowed) {
    const costValue = opts.cost != null ? toDecimal(opts.cost) : undefined;
    const amountValue = toDecimal(opts.amount ?? 0);
    if (
      costValue != null &&
      !isPaygService(opts.service) &&
      amountValue.add(ALLOWED_SLACK).gte(costValue)
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
