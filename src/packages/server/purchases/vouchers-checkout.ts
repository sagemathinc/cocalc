import getLogger from "@cocalc/backend/logger";
import createStripeCheckoutSession from "./create-stripe-checkout-session";
import { getCheckoutCart } from "./shopping-cart-checkout";
import getMinBalance from "./get-min-balance";
import getBalance from "./get-balance";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import getChargeAmount from "@cocalc/util/purchases/charge-amount";
import type { CheckoutParams } from "./shopping-cart-checkout";

const logger = getLogger("purchases:vouchers-checkout");

export default async function vouchersCheckout({
  account_id,
  success_url,
  cancel_url,
  config,
}: {
  account_id: string;
  success_url: string;
  cancel_url?: string;
  config: any;
}) {
  logger.debug({
    account_id,
    success_url,
    cancel_url,
    config,
  });

  // [ ] TODO: admin case!!

  const params = await getVoucherCartCheckoutParams(account_id, config.count);
  if (params.chargeAmount <= 0) {
    // [ ]  TODO: here we would make the vouchers.
    return { done: true };
  }

  const session = await createStripeCheckoutSession({
    account_id,
    success_url,
    cancel_url,
    amount: params.chargeAmount,
    description: "Credit Account to Complete Voucher Purchase",
  });
  // make a stripe checkout session from the chargeAmount.
  // When it gets paid, user gets their purchases.
  return { done: false, session };
}

export async function getVoucherCartCheckoutParams(
  account_id: string,
  count: number
): Promise<CheckoutParams> {
  if (!count) {
    throw Error("count must be specified");
  }
  const { total, cart } = await getCheckoutCart(
    account_id,
    (item) => item.checked && item.description?.["period"] == "range"
  );
  const minBalance = await getMinBalance(account_id);
  const balance = await getBalance(account_id);
  const { pay_as_you_go_min_payment: minPayment } = await getServerSettings();
  const { amountDue, chargeAmount } = getChargeAmount({
    cost: total * count,
    balance,
    minBalance,
    minPayment,
  });

  return {
    balance,
    minPayment,
    minBalance,
    amountDue,
    chargeAmount,
    total,
    cart,
  };
}
