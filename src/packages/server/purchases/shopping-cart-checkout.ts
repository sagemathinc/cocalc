import { getTransactionClient } from "@cocalc/database/pool";
import getCart from "@cocalc/server/shopping/cart/get";
import { computeCost } from "@cocalc/util/licenses/store/compute-cost";
import getBalance from "./get-balance";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import purchaseShoppingCartItem from "./purchase-shopping-cart-item";
import getLogger from "@cocalc/backend/logger";
import createStripeCheckoutSession from "./create-stripe-checkout-session";
import getChargeAmount from "@cocalc/util/purchases/charge-amount";
import getMinBalance from "./get-min-balance";

const logger = getLogger("purchases:shopping-cart-checkout");

export interface CheckoutParams {
  balance: number; // this user's balance before payment happens
  minPayment: number; // min allowed payment size
  amountDue: number; // actual amount due if it weren't for minPayment
  chargeAmount: number; // actual amount due because of minPayment
  total: number; // total of items in cart
  minBalance: number; // min allowed balance for this user
  cart; // big object that describes actual contents of the cart
}

export default async function shoppingCartCheckout({
  account_id,
  success_url,
  cancel_url,
  paymentAmount,
}: {
  account_id: string;
  success_url: string;
  cancel_url?: string;
  paymentAmount?: number;
}) {
  logger.debug("shoppingCartCheckout", { account_id, success_url, cancel_url });

  const params = await getShoppingCartCheckoutParams(account_id);
  if (Math.max(paymentAmount ?? 0, params.chargeAmount) <= 0) {
    // immediately create all the purchase items and products for the user.
    // No need to make a stripe checkout session, since user has sufficient
    // balance in their account to make the purchase.
    // **We do the purchase of everything as one big database transaction.**
    const client = await getTransactionClient();
    try {
      // start atomic transaction
      for (const item of params.cart) {
        await purchaseShoppingCartItem(item, client);
      }
      await client.query("COMMIT");
    } catch (err) {
      logger.debug(
        "shoppingCartCheckout -- error -- rolling back entire transaction",
        err
      );
      await client.query("ROLLBACK");
      throw err;
    } finally {
      // end atomic transaction
      client.release();
    }

    return { done: true };
  }

  const session = await createStripeCheckoutSession({
    account_id,
    success_url,
    cancel_url,
    amount: Math.max(paymentAmount ?? 0, params.chargeAmount),
    description: "Credit Account to Complete Store Purchase",
  });
  // make a stripe checkout session from the chargeAmount.
  // When it gets paid, user gets their purchases.
  return { done: false, session };
}

export async function getCheckoutCart(
  account_id: string,
  filter?: (item) => boolean // optional filter on shopping cart items; this is useful for the voucher checkout
) {
  // Get the list of items in the cart that haven't been purchased
  // or saved for later, and are currently checked.
  // TODO -- typing
  let cart: any[] = await getCart({
    account_id,
    purchased: false,
    removed: false,
  });
  cart = cart.filter(
    filter ?? ((item) => item.checked && item.product == "site-license")
  );

  // compute the total cost and also set the costs for each item
  let total = 0;
  for (const item of cart) {
    item.cost = computeCost(item.description);
    if (item.cost == null) {
      throw Error("bug cost must not be null");
    }
    total += item.cost.discounted_cost;
  }
  return { total, cart };
}

export async function getShoppingCartCheckoutParams(
  account_id: string
): Promise<CheckoutParams> {
  const { total, cart } = await getCheckoutCart(account_id);
  const minBalance = await getMinBalance(account_id);
  const balance = await getBalance(account_id);
  const { pay_as_you_go_min_payment: minPayment } = await getServerSettings();
  const { amountDue, chargeAmount } = getChargeAmount({
    cost: total,
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
