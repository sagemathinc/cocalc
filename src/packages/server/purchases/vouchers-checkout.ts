import getLogger from "@cocalc/backend/logger";
import createStripeCheckoutSession from "./create-stripe-checkout-session";
import { getCheckoutCart } from "./shopping-cart-checkout";
import getMinBalance from "./get-min-balance";
import getBalance from "./get-balance";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import getChargeAmount from "@cocalc/util/purchases/charge-amount";
import type { CheckoutParams } from "./shopping-cart-checkout";
import createVouchers from "@cocalc/server/vouchers/create-vouchers";
import type { WhenPay } from "@cocalc/util/vouchers";
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
}) {
  logger.debug({
    account_id,
    success_url,
    cancel_url,
    config,
  });

  if (!config.count || config.count < 0) {
    throw Error("config.count must be positive");
  }

  if (config.whenPay == "admin") {
    const info = await createVouchers({
      ...config,
      account_id,
    });
    return { done: true, info };
  }

  const params = await getVoucherCartCheckoutParams(account_id, config.count);
  if (params.chargeAmount <= 0) {
    const info = await createVouchers({
      ...config,
      account_id,
    });
    return { done: true, info };
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

export async function getVoucherCheckoutCart(account_id) {
  return await getCheckoutCart(
    account_id,
    (item) =>
      item.checked &&
      (item.description?.["period"] == "range" ||
        item.product == "cash-voucher")
  );
}

export async function getVoucherCartCheckoutParams(
  account_id: string,
  count: number
): Promise<CheckoutParams> {
  if (!count) {
    throw Error("count must be specified");
  }
  const { total, cart } = await getVoucherCheckoutCart(account_id);
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