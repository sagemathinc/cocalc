/*
Purchase one item of a shopping cart:

1. Create a license with the account_id as a manager.
2. Create an entry in the purchases table corresponding to this purchase, so it has the given cost, etc.
3. Mark this item of the shopping cart as purchased.

**Note that stripe is NOT involved in any way.**  Also, this is NOT concerned
with spending quotas or balances or anything.  This just allows any purchase.

This is used shopping-cart-checkout to actually create a license and items in the purchases
table corresponding to an item in a shopping cart, then mark that cart item as purchased.
This function is definitely not meant to be called directly via the api.


Here's what a typical shopping cart item looks like:

{
  "id": 4,
  "account_id": "8e138678-9264-431c-8dc6-5c4f6efe66d8",
  "added": "2023-06-24T19:25:57.139Z",
  "checked": true,
  "removed": null,
  "purchased": null,
  "product": "site-license",
  "description": {
    "type": "vm",
    "range": [
      "2023-06-29T07:00:00.000Z",
      "2023-07-04T06:59:59.999Z"
    ],
    "period": "range",
    "dedicated_vm": {
      "machine": "n2-highmem-8"
    }
  },
  "project_id": null,
  "cost": {
    "cost": 112.78032786885247,
    "cost_per_unit": 112.78032786885247,
    "cost_per_project_per_month": 687.96,
    "cost_sub_month": 687.96,
    "cost_sub_year": 8255.52,
    "input": {
      "type": "vm",
      "range": [
        "2023-06-29T07:00:00.000Z",
        "2023-07-04T06:59:59.999Z"
      ],
      "period": "range",
      "dedicated_vm": {
        "machine": "n2-highmem-8"
      },
      "subscription": "no",
      "start": "2023-06-29T07:00:00.000Z",
      "end": "2023-07-04T06:59:59.999Z"
    },
    "period": "range"
  }
}
*/

import getPool, { PoolClient } from "@cocalc/database/pool";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import getPurchaseInfo from "@cocalc/util/licenses/purchase/purchase-info";
import { sanity_checks } from "@cocalc/util/licenses/purchase/sanity-checks";
import createLicense from "@cocalc/server/licenses/purchase/create-license";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import { restartProjectIfRunning } from "@cocalc/server/projects/control/util";
import getLogger from "@cocalc/backend/logger";
import createSubscription from "./create-subscription";
import addLicenseToProject from "@cocalc/server/licenses/add-to-project";
import { round2up } from "@cocalc/util/misc";
import { periodicCost } from "@cocalc/util/licenses/purchase/compute-cost";
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
  if (item.product == "site-license") {
    await purchaseLicenseShoppingCartItem(item, client, credit_id);
  } else if (item.product == "cash-voucher") {
    await purchaseVoucherShoppingCartItem(item, client, credit_id);
  } else if (item.product == "membership") {
    await purchaseMembershipShoppingCartItem(item, client);
  } else {
    throw Error(`unknown product type '${item.product}'`);
  }
}

/***
  Licenses
 ***/

async function purchaseLicenseShoppingCartItem(
  item,
  client: PoolClient,
  credit_id?: number,
) {
  logger.debug("purchaseLicenseShoppingCartItem", item);
  if (item.product != "site-license") {
    throw Error("product type must be 'site-license'");
  }

  const { license_id, info, licenseCost } =
    await createLicenseFromShoppingCartItem(item, client);
  logger.debug(
    "purchaseLicenseShoppingCartItem -- created license from shopping cart item",
    license_id,
    item,
    info,
    licenseCost,
  );

  const purchase_id = await createPurchase({
    account_id: item.account_id,
    cost: round2up(licenseCost.cost),
    unrounded_cost: licenseCost.cost,
    service: "license",
    description: { type: "license", item, info, license_id, credit_id },
    tag: "license-purchase",
    period_start: info.start,
    period_end: info.end,
    client,
  });
  logger.debug(
    "purchaseLicenseShoppingCartItem -- created purchase from shopping cart item",
    { purchase_id, license_id, item_id: item.id },
  );

  if (item.description.period != "range") {
    let interval = item.description.period;
    if (interval.endsWith("ly")) {
      interval = interval.slice(0, -2); // get rid of the ly
    }
    // cost = cost per interval of the subscription, i.e., per month or year.
    const cost = periodicCost(licenseCost);
    if (!cost || cost <= 0) {
      throw Error(`invalid subscription cost=${cost}`);
    }
    const subscription_id = await createSubscription(
      {
        account_id: item.account_id,
        cost,
        interval,
        current_period_start: info.start,
        current_period_end: info.end,
        latest_purchase_id: purchase_id,
        status: "active",
        metadata: { type: "license", license_id },
      },
      client,
    );
    logger.debug(
      "purchaseLicenseShoppingCartItem -- created subscription from shopping cart item",
      { subscription_id, license_id, item_id: item.id },
    );
  }

  await markItemPurchased(item, license_id, client);
  logger.debug(
    "purchaseLicenseShoppingCartItem: moved shopping cart item to purchased.",
  );
}

export async function createLicenseFromShoppingCartItem(
  item,
  client: PoolClient,
): Promise<{ license_id: string; info; licenseCost }> {
  const info = getPurchaseInfo(item.description);
  let licenseCost = item.cost;

  logger.debug("running sanity checks on license...");
  const pool = client ?? getPool();
  await sanity_checks(pool, info);
  const license_id = await createLicense(item.account_id, info, pool);
  if (item.project_id) {
    addLicenseToProjectAndRestart(item.project_id, license_id, client);
  }
  return { info, license_id, licenseCost };
}

async function markItemPurchased(
  item,
  license_id: string | undefined,
  client: PoolClient,
) {
  const pool = client ?? getPool();
  await pool.query(
    `
      UPDATE shopping_cart_items
      SET purchased = COALESCE(purchased, '{}'::jsonb) || $3::jsonb
      WHERE account_id = $1 AND id = $2
    `,
    [item.account_id, item.id, { success: true, time: new Date(), license_id }],
  );
}
export async function addLicenseToProjectAndRestart(
  project_id: string,
  license_id: string,
  client: PoolClient,
) {
  try {
    await addLicenseToProject({ project_id, license_id, client });
    await restartProjectIfRunning(project_id);
  } catch (err) {
    // non-fatal, since it's just a convenience.
    logger.debug("WARNING -- issue adding license to project ", err);
  }
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

  await markItemPurchased(item, undefined, client);
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

  await markItemPurchased(item, undefined, client);
}
