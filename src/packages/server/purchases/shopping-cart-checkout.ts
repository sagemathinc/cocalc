import getLogger from "@cocalc/backend/logger";

import { getTransactionClient } from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

import getCart from "@cocalc/server/shopping/cart/get";

import { Item as ShoppingCartItem, ProductDescription } from "@cocalc/util/db-schema/shopping-cart-items";
import { computeCost } from "@cocalc/util/licenses/store/compute-cost";
import { CostInputPeriod } from "@cocalc/util/licenses/purchase/types";
import getChargeAmount from "@cocalc/util/purchases/charge-amount";
import { ComputeCostProps } from "@cocalc/util/upgrades/shopping";
import { round2 } from "@cocalc/util/misc";

import createStripeCheckoutSession from "./create-stripe-checkout-session";
import getMinBalance from "./get-min-balance";
import getBalance from "./get-balance";
import purchaseShoppingCartItem from "./purchase-shopping-cart-item";

const logger = getLogger("purchases:shopping-cart-checkout");

export interface CheckoutCartItem extends ShoppingCartItem {
  cost: CostInputPeriod
}

export interface CheckoutParams {
  balance: number; // this user's balance before payment happens
  minPayment: number; // min allowed payment size
  amountDue: number; // actual amount due if it weren't for minPayment
  chargeAmount: number; // actual amount due because of minPayment
  total: number; // total of items in cart
  minBalance: number; // min allowed balance for this user
  cart; // big object that describes actual contents of the cart
}

export const toFriendlyDescription = (description: ProductDescription): string => {
  switch(description.type) {
    case "disk":
    case "vm":
    case "quota":
    case "vouchers":
    case "cash-voucher":
    default:
      return "Credit account to complete store purchase"
  }
}

export const shoppingCartCheckout = async({
  account_id,
  success_url,
  cancel_url,
  paymentAmount,
}: {
  account_id: string;
  success_url: string;
  cancel_url?: string;
  paymentAmount?: number;
}) => {
  logger.debug("shoppingCartCheckout", { account_id, success_url, cancel_url });

  // When explicit payment amount is not provided (or is zero), we use the user's existing
  // account balance.
  //
  const paymentAmountValue = Number(paymentAmount ?? 0).valueOf();
  const useBalance = (paymentAmount ?? 0) == 0;

  // Assert validity of user-provided payment amount
  //
  if (!Number.isFinite(paymentAmountValue)) {
    throw Error("Invalid payment amount.");
  }

  const params = await getShoppingCartCheckoutParams(account_id);
  const surplusCredit = paymentAmountValue - params.chargeAmount;

  // Validate paymentAmount is sufficient when not debiting from user's balance
  //
  if (!useBalance && surplusCredit < 0) {
    throw Error("Payment amount is insufficient to complete transaction.");
  }

  if (useBalance && params.chargeAmount <= 0) {
    // If the user has sufficient balance to complete the cart checkout AND we're to use
    // the existing account balance, we immediately create all the purchase items and
    // products for the user and deduct the charges for each from the existing balance.
    //
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

  // Track available balance for line item accounting when using existing balance
  //
  let availableBalance = params.balance - params.minBalance;

  const sortedCartItems = params.cart.sort((a, b) => {
    const itemA = Math.max(a.cost?.discounted_cost ?? 0, 0);
    const itemB = Math.max(b.cost?.discounted_cost ?? 0, 0);

    if (itemA < itemB) {
      return -1;
    } else if (itemA > itemB) {
      return 1;
    }

    return 0;
  })
  const stripeCheckoutList = (sortedCartItems as CheckoutCartItem[]).map((item) => {
    const itemCharge = Math.max(item.cost?.discounted_cost ?? 0, 0);
    const description = toFriendlyDescription(item.description);

    // If user's account balance is to be used, deduct the (discounted) cost for this line
    // item from the available balance, but mark it as an entry in the Stripe invoice for
    // reference.
    //
    if (useBalance) {
      if (availableBalance >= itemCharge) {
        // When sufficient account balance exists, deduct entire charge from that.
        //
        availableBalance -= itemCharge;

        return {
          amount: 0,
          description: `${description} ($${round2(itemCharge).toFixed(2)} deducted from account balance)`
        };
      } else if (availableBalance > 0) {
        // Otherwise, deduct remaining available balance and charge the remainder accordingly.
        //
        const remainingAvailableBalance = availableBalance;
        availableBalance = 0;

        return {
          amount: itemCharge - remainingAvailableBalance,
          description: `${description} ($${round2(remainingAvailableBalance).toFixed(2)} deducted from account balance)`
        };
      }

      return {
        amount: itemCharge,
        description,
      };
    }

    return {
      amount: itemCharge,
      description,
    };
  });

  // Add line item corresponding to minimum payment requirement. If paymentAmountValue
  // is non-zero, it's already been verified to be greater than the minimum required
  // payment so that we don't need to add the extra charge.
  //
  // (see src/packages/util/purchases/charge-amount.ts)
  //
  const minimumPaymentCharge = params.chargeAmount - params.amountDue;
  if (minimumPaymentCharge > 0 && !paymentAmountValue) {
    stripeCheckoutList.push({
      amount: minimumPaymentCharge,
      description: "Pay-as-you-go minimum payment charge"
    });
  }

  // Add line item corresponding to extra account credit requested by user
  //
  if (surplusCredit > 0) {
    stripeCheckoutList.push({
      amount: surplusCredit,
      description: "User-requested account credit"
    });
  }

  const session = await createStripeCheckoutSession({
    account_id,
    success_url,
    cancel_url,
    line_items: stripeCheckoutList,
  });
  // make a stripe checkout session from the generated line items.
  // When it gets paid, user gets their purchases.
  return { done: false, session };
}

export const getCheckoutCart = async (
  account_id: string,
  filter?: (item) => boolean // optional filter on shopping cart items; this is useful for the voucher checkout
) => {
  // Get the list of items in the cart that haven't been purchased
  // or saved for later, and are currently checked.
  let cart: ShoppingCartItem[] = await getCart({
    account_id,
    purchased: false,
    removed: false,
  });
  cart = cart.filter(
    filter ?? ((item) => item.checked && item.product == "site-license")
  );

  // compute the total cost and also set the costs for each item
  let total = 0;
  const chargeableCart: CheckoutCartItem[] = cart.map((cartItem) => {
    const itemCost = computeCost(cartItem.description as ComputeCostProps);
    if (itemCost == null) {
      throw Error("bug cost must not be null");
    }

    total += itemCost.discounted_cost;

    return {
      ...cartItem,
      cost: itemCost,
    };
  });
  return { total, cart: chargeableCart };
}

export const getShoppingCartCheckoutParams = async (
  account_id: string
): Promise<CheckoutParams> => {
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

export default shoppingCartCheckout;
