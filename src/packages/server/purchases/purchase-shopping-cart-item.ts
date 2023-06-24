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
    "discounted_cost": 112.78032786885247,
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

import getPool from "@cocalc/database/pool";
import createPurchase from "@cocalc/server/purchases/create-purchase";
import getPurchaseInfo from "@cocalc/util/licenses/purchase/purchase-info";
import { sanity_checks } from "@cocalc/util/licenses/purchase/sanity-checks";
import createLicense from "@cocalc/server/licenses/purchase/create-license";
import { db } from "@cocalc/database";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import { restartProjectIfRunning } from "@cocalc/server/projects/control/util";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("purchases:purchase-shopping-cart-item");

export default async function purchaseShoppingCartItem(item) {
  logger.debug("purchaseShoppingCartItem", item);
  if (item.product != "site-license") {
    // This *ONLY* implements purchasing the site-license product, which is the only
    // one we have right now.
    throw Error("only the 'site-license' product is currently implemented");
  }

  // just a little sanity check.
  if (!(await isValidAccount(item?.account_id))) {
    throw Error(`invalid account_id - ${item.account_id}`);
  }

  const { license_id, info } = await createLicenseFromShoppingCartItem(item);
  logger.debug(
    "purchaseShoppingCartItem -- created license from shopping cart item",
    license_id,
    item,
    info
  );

  const purchase_id = await createPurchase({
    account_id: item.account_id,
    cost: item.cost.cost,
    service: "license",
    description: { type: "license", item, info, license_id },
    tag: "license-purchase",
  });
  logger.debug(
    "purchaseShoppingCartItem -- created purchase from shopping cart item",
    { purchase_id, license_id }
  );

  await markItemPurchased(item, license_id);
  logger.debug("moved shopping cart item to purchased.");
}

async function createLicenseFromShoppingCartItem(
  item
): Promise<{ license_id: string; info }> {
  const info = getPurchaseInfo(item.description);
  logger.debug("running sanity checks on license...");
  const pool = getPool();
  await sanity_checks(pool, info);
  const database = db();
  const license_id = await createLicense(database, item.account_id, info);
  if (item.project_id) {
    addLicenseToProject(database, item.project_id, license_id);
  }
  return { info, license_id };
}

async function markItemPurchased(item, license_id: string) {
  const pool = getPool();
  await pool.query(
    "UPDATE shopping_cart_items SET purchased=$3 WHERE account_id=$1 AND id=$2",
    [item.account_id, item.id, { success: true, time: new Date(), license_id }]
  );
}

async function addLicenseToProject(
  database,
  project_id: string,
  license_id: string
) {
  try {
    await database.add_license_to_project(project_id, license_id);
    await restartProjectIfRunning(project_id);
  } catch (err) {
    // non-fatal, since it's just a convenience.
    logger.debug("WARNING -- issue adding license to project ", err);
  }
}
