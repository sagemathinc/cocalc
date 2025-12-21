import getLogger from "@cocalc/backend/logger";
import { getTransactionClient } from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import getCart from "@cocalc/server/shopping/cart/get";
import { removeShoppingCartPaymentIntent } from "@cocalc/server/shopping/cart/payment-intent";
import { Item as ShoppingCartItem } from "@cocalc/util/db-schema/shopping-cart-items";
import { CostInputPeriod } from "@cocalc/util/licenses/purchase/types";
import { computeCost } from "@cocalc/util/licenses/store/compute-cost";
import getChargeAmount from "@cocalc/util/purchases/charge-amount";
import { ComputeCostProps } from "@cocalc/util/upgrades/shopping";
import { currency, round2up } from "@cocalc/util/misc";
import getMinBalance from "./get-min-balance";
import getBalance from "./get-balance";
import purchaseShoppingCartItem from "./purchase-shopping-cart-item";
import { stripeToDecimal } from "@cocalc/util/stripe/calc";
import { computeMembershipPricing } from "@cocalc/server/membership/tiers";

const logger = getLogger("purchases:shopping-cart-checkout");

// if somehow the user's balance is not quite enough by this amount,
// then we still let purchase go through. This is to deal with
// potentially a pay-as-you-go purchase reducing your balance right when
// make the purchase (see https://github.com/sagemathinc/cocalc/issues/7099)
// or possibly slight rounding errors.  Payg is highly unlikely since it's
// done discretely once per day, and you would likely just have to retry
// your purchase.  There is a very slight potential abuse where a user might
// use the api to get a one time temporary $3 discount by abusing this.
// We would still eventually invoice them for this.
export const ALLOWED_SLACK = 3; // off by up to $3

export interface CheckoutCartItem extends ShoppingCartItem {
  cost: CostInputPeriod;
  lineItemAmount: number;
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

export async function shoppingCartCheckout({
  account_id,
  payment_intent,
  cart_ids,
  amount,
  credit_id,
}: {
  account_id: string;
  // in case items in the cart are partly paid for via stripe, this is the payment intent.
  // shoppingCartCheckout is called right after successfully processing the payment!
  payment_intent?: string;
  // optional id's of shopping cart items user intends to purchase
  cart_ids?: number[];
  // if given, then the user paid this amount in cash as part of a transaction to
  // buy the things in the cart.  I.e., we definitely got this amount of money via
  // stripe from the user.  If their total order is <= amount, then we will definitely
  // fullfill their order, even if their account balance is negative.
  amount?: number;
  // if some credit was specifically used to buy items in cart, record that
  credit_id?: number;
}) {
  logger.debug("shoppingCartCheckout", {
    account_id,
    payment_intent,
  });
  const params = await getShoppingCartCheckoutParams(
    account_id,
    payment_intent,
    undefined,
    cart_ids,
  );

  if (
    params.amountDue <= ALLOWED_SLACK ||
    (amount != null && params.total <= amount + ALLOWED_SLACK)
  ) {
    // The user has sufficient balance to complete the cart checkout, so we immediately
    // create all the purchase items and products for the user and deduct the charges
    // for each from the existing balance.
    //
    // **We do the purchase of everything as one single database transaction so it is all or nothing,
    //   which is probably less confusing if it goes wrong.**
    //
    const client = await getTransactionClient();
    try {
      // start atomic transaction
      for (const item of params.cart) {
        await purchaseShoppingCartItem(item, client, credit_id);
      }
      await client.query("COMMIT");
    } catch (err) {
      logger.debug(
        "shoppingCartCheckout -- error -- rolling back entire transaction",
        err,
      );
      await client.query("ROLLBACK");
      throw err;
    } finally {
      // end atomic transaction
      client.release();
    }
  } else {
    throw Error(
      `Insufficient credit on your account to complete the purchase (you need ${currency(params.chargeAmount)}). Please refresh your browser and try again or contact support.`,
    );
  }
}

// payment canceled, so make the items available in the cart again
export async function shoppingCartPutItemsBack({ cart_ids }) {
  await removeShoppingCartPaymentIntent({ cart_ids });
}

export async function getCheckoutCart(
  account_id: string,
  // optional filter on shopping cart items; this is useful for the voucher checkout
  filter?: (item) => boolean,
  payment_intent?: string,
  processing?: boolean,
  cart_ids?: number[],
) {
  // Get the list of items in the cart that haven't been purchased
  // or saved for later, and are currently checked.
  let cart: ShoppingCartItem[] = await getCart({
    account_id,
    purchased: false,
    removed: false,
    payment_intent,
    processing,
    cart_ids,
  });
  cart = cart.filter(
    filter ??
      ((item) =>
        item.checked &&
        (item.product == "site-license" ||
          item.product == "cash-voucher" ||
          item.product == "membership")),
  );
  const membershipItems = cart.filter((item) => item.product == "membership");
  if (membershipItems.length > 1) {
    throw Error("only one membership can be purchased at a time");
  }

  // compute the total cost and also set the costs for each item
  let totalStripe = 0;
  const chargeableCart: CheckoutCartItem[] = [];
  for (const cartItem of cart) {
    const itemCost =
      cartItem.product == "membership"
        ? await membershipCostFromCart(account_id, cartItem)
        : computeCost(cartItem.description as ComputeCostProps);
    if (itemCost == null) {
      throw Error("bug cost must not be null");
    }
    const lineItemAmount = round2up(itemCost.cost);
    totalStripe += Math.ceil(100 * lineItemAmount);
    chargeableCart.push({
      ...cartItem,
      cost: itemCost,
      lineItemAmount,
    });
  }
  return { total: stripeToDecimal(totalStripe), cart: chargeableCart };
}

async function membershipCostFromCart(account_id: string, cartItem) {
  const description = cartItem?.description;
  if (description?.type != "membership") {
    throw Error("invalid membership description");
  }
  const { price, charge } = await computeMembershipPricing({
    account_id,
    targetClass: description.class,
    interval: description.interval,
  });
  const monthly = description.interval == "month" ? price : price / 12;
  const yearly = description.interval == "year" ? price : price * 12;
  const period = description.interval == "month" ? "monthly" : "yearly";
  const cost: CostInputPeriod = {
    cost: charge,
    cost_per_unit: price,
    cost_per_project_per_month: monthly,
    cost_sub_month: monthly,
    cost_sub_year: yearly,
    cost_sub_first_period: charge,
    quantity: 1,
    period,
    input: {
      type: "cash-voucher",
      amount: price,
      subscription: period,
    },
  };
  return cost;
}

export async function getShoppingCartCheckoutParams(
  account_id: string,
  payment_intent?: string,
  processing?: boolean,
  cart_ids?: number[],
): Promise<
  CheckoutParams & { minimumPaymentCharge: number; cureAmount: number }
> {
  const { total, cart } = await getCheckoutCart(
    account_id,
    undefined,
    payment_intent,
    processing,
    cart_ids,
  );
  const minBalance = await getMinBalance(account_id);
  const balance = await getBalance({ account_id });
  const { pay_as_you_go_min_payment: minPayment } = await getServerSettings();
  const { amountDue, chargeAmount, minimumPaymentCharge, cureAmount } =
    getChargeAmount({
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
    minimumPaymentCharge,
    cureAmount,
  };
}
