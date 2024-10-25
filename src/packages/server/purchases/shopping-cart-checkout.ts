import getLogger from "@cocalc/backend/logger";

import { getTransactionClient } from "@cocalc/database/pool";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

import getCart from "@cocalc/server/shopping/cart/get";

import {
  CashVoucher,
  Item as ShoppingCartItem,
} from "@cocalc/util/db-schema/shopping-cart-items";
import {
  dedicatedDiskDisplay,
  dedicatedVmDisplay,
} from "@cocalc/util/upgrades/utils";
import { describe_quota } from "@cocalc/util/licenses/describe-quota";
import { CostInputPeriod } from "@cocalc/util/licenses/purchase/types";
import { computeCost } from "@cocalc/util/licenses/store/compute-cost";
import getChargeAmount from "@cocalc/util/purchases/charge-amount";
import {
  ComputeCostProps,
  SiteLicenseDescriptionDB,
} from "@cocalc/util/upgrades/shopping";
import { currency, round2up } from "@cocalc/util/misc";
import getMinBalance from "./get-min-balance";
import getBalance from "./get-balance";
import purchaseShoppingCartItem, {
  getInitialCostForSubscription,
} from "./purchase-shopping-cart-item";

const logger = getLogger("purchases:shopping-cart-checkout");

// if somehow the user's balance is not quite enough by this amount,
// then we still let purchase go through. This is to deal with
// potentially a pay-as-you-go purchase reducing your balance right when
// make the purchase (see https://github.com/sagemathinc/cocalc/issues/7099)
// or possibly slight rounding errors.  Payg is highly unlikely since it's
// done discretely once per day, and you would likely just have to retry
// your purchase.  There is a very slight potential abuse where a user might
// use the api to get a one time $1 discount by abusing this....
const ALLOWED_SLACK = 1; // off by up to a dollar

export interface CheckoutCartItem extends ShoppingCartItem {
  cost: CostInputPeriod;
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

export const toFriendlyDescription = (
  description: SiteLicenseDescriptionDB | CashVoucher,
): string => {
  switch (description.type) {
    case "disk":
      return `Dedicated Disk (${dedicatedDiskDisplay(
        description.dedicated_disk,
      )})`;
    case "vm":
      return `Dedicated VM ${dedicatedVmDisplay(description.dedicated_vm)}`;
    case "quota":
      return describe_quota(description);
    case "cash-voucher":
      return `${currency((description as CashVoucher).amount)} account credit`;
    default:
      return "Credit account to complete store purchase";
  }
};

export const shoppingCartCheckout = async ({
  account_id,
}: {
  account_id: string;
}) => {
  logger.debug("shoppingCartCheckout", {
    account_id,
  });
  const params = await getShoppingCartCheckoutParams(account_id);

  if (params.amountDue <= ALLOWED_SLACK) {
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
        await purchaseShoppingCartItem(item, client);
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
};

export const getCheckoutCart = async (
  account_id: string,
  // optional filter on shopping cart items; this is useful for the voucher checkout
  filter?: (item) => boolean,
) => {
  // Get the list of items in the cart that haven't been purchased
  // or saved for later, and are currently checked.
  let cart: ShoppingCartItem[] = await getCart({
    account_id,
    purchased: false,
    removed: false,
  });
  cart = cart.filter(
    filter ?? ((item) => item.checked && item.product == "site-license"),
  );

  // compute the total cost and also set the costs for each item
  let total = 0;
  const chargeableCart: CheckoutCartItem[] = [];
  for (const cartItem of cart) {
    const itemCost = computeCost(cartItem.description as ComputeCostProps);
    if (itemCost == null) {
      throw Error("bug cost must not be null");
    }
    if (
      cartItem.description.type != "cash-voucher" &&
      cartItem.description.period != "range"
    ) {
      // it's a subscription
      const x = await getInitialCostForSubscription(cartItem);
      const firstPeriodCost = x.cost.cost;
      itemCost.cost_sub_first_period = firstPeriodCost;
      total += round2up(firstPeriodCost);
    } else {
      total += round2up(itemCost.cost);
    }

    chargeableCart.push({
      ...cartItem,
      cost: itemCost,
    });
  }
  return { total: round2up(total), cart: chargeableCart };
};

export const getShoppingCartCheckoutParams = async (
  account_id: string,
): Promise<
  CheckoutParams & { minimumPaymentCharge: number; cureAmount: number }
> => {
  const { total, cart } = await getCheckoutCart(account_id);
  const minBalance = await getMinBalance(account_id);
  const balance = await getBalance(account_id);
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
};
