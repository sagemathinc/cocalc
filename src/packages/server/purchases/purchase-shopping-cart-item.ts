/*
Purchase one item of a shopping cart:

1. Create the requested product (membership subscription or vouchers).
2. Create a purchase record for that item.
3. Mark the cart item as purchased.

**Note that stripe is NOT involved in any way.**  Also, this is NOT concerned
with spending quotas or balances or anything.  This just allows any purchase.

This is used shopping-cart-checkout to fulfill an item and mark it as purchased.
This function is definitely not meant to be called directly via the api.
*/

import getPool, { PoolClient } from "@cocalc/database/pool";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import getLogger from "@cocalc/backend/logger";
import createSubscription from "./create-subscription";
import createVouchers from "@cocalc/server/vouchers/create-vouchers";
import dayjs from "dayjs";
import { computeMembershipPricing } from "@cocalc/server/membership/tiers";

const logger = getLogger("purchases:purchase-shopping-cart-item");

export default async function purchaseShoppingCartItem(
  item,
  client: PoolClient,
  credit_id?: number,
) {
  logger.debug("purchaseShoppingCartItem", item);
  // just a little sanity check.
  if (!(await isValidAccount(item?.account_id))) {
    throw Error(`invalid account_id - ${item.account_id}`);
  }
  if (item.product == "cash-voucher") {
    await purchaseVoucherShoppingCartItem(item, client, credit_id);
  } else if (item.product == "membership") {
    await purchaseMembershipShoppingCartItem(item, client);
  } else {
    throw Error(`unsupported product type '${item.product}'`);
  }
}

async function markItemPurchased(item, client: PoolClient) {
  const pool = client ?? getPool();
  await pool.query(
    `
      UPDATE shopping_cart_items
      SET purchased = COALESCE(purchased, '{}'::jsonb) || $3::jsonb
      WHERE account_id = $1 AND id = $2
    `,
    [item.account_id, item.id, { success: true, time: new Date() }],
  );
}

/***
  Vouchers
 ***/

async function purchaseVoucherShoppingCartItem(
  item,
  client: PoolClient,
  credit_id?: number,
) {
  logger.debug("purchaseVoucherShoppingCartItem", item);
  const { description } = item;
  if (description.type != "cash-voucher") {
    throw Error("product type must be 'cash-voucher'");
  }
  description.credit_id = credit_id;

  await createVouchers({
    ...description,
    account_id: item.account_id,
    client,
  });

  await markItemPurchased(item, client);
}

/***
  Memberships
 ***/

async function purchaseMembershipShoppingCartItem(
  item,
  client: PoolClient,
) {
  logger.debug("purchaseMembershipShoppingCartItem", item);
  const { description } = item;
  if (description?.type != "membership") {
    throw Error("product type must be 'membership'");
  }

  const pricing = await computeMembershipPricing({
    account_id: item.account_id,
    targetClass: description.class,
    interval: description.interval,
    client,
  });

  if (pricing.existing_subscription_id) {
    await client.query(
      "UPDATE subscriptions SET status='canceled', canceled_at=NOW(), canceled_reason=$1 WHERE id=$2",
      [
        `Upgraded to ${description.class}`,
        pricing.existing_subscription_id,
      ],
    );
  }

  const start = dayjs().toDate();
  const end =
    description.interval == "month"
      ? dayjs(start).add(1, "month").toDate()
      : dayjs(start).add(1, "year").toDate();

  const subscription_id = await createSubscription(
    {
      account_id: item.account_id,
      cost: pricing.price,
      interval: description.interval,
      current_period_start: start,
      current_period_end: end,
      latest_purchase_id: 0,
      status: "active",
      metadata: { type: "membership", class: description.class },
    },
    client,
  );

  const purchase_id = await createPurchase({
    account_id: item.account_id,
    cost: pricing.charge,
    unrounded_cost: pricing.charge,
    service: "membership",
    description: {
      type: "membership",
      subscription_id,
      class: description.class,
      interval: description.interval,
    },
    tag: "membership-purchase",
    period_start: start,
    period_end: end,
    client,
  });
  await client.query(
    "UPDATE subscriptions SET latest_purchase_id=$1 WHERE id=$2",
    [purchase_id, subscription_id],
  );
  logger.debug(
    "purchaseMembershipShoppingCartItem -- created membership subscription",
    { subscription_id, purchase_id },
  );

  await markItemPurchased(item, client);
}
