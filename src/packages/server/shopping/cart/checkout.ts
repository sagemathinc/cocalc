/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Purchase everything that is checked and in the shopping cart.

This API endpoint gets called when user has confirmed their payment
method and clicked the button to complete the purchase.

Of course this doesn't take any input, since the contents of the cart
is already in the database, and the card info (and which is the default)
is in stripe only.

If this successfully runs, then the checked items in the shopping
cart are changed in the database so that the purchased field is set.
*/

import getCart from "./get";
import purchaseLicense from "@cocalc/server/licenses/purchase";
import getPool from "@cocalc/database/pool";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import { SiteLicenseDescriptionDB } from "@cocalc/util/upgrades/shopping";
import {
  PurchaseInfo,
  Subscription,
} from "@cocalc/util/licenses/purchase/types";

export default async function checkout(account_id: string): Promise<void> {
  // Get the list of items in the cart that haven't been purchased
  // or saved for later, and are currently checked.
  const cart = (
    await getCart({ account_id, purchased: false, removed: false })
  ).filter((item) => item.checked);

  // Purchase each item.
  // TODO: obviously, we should make one purchase that includes all the items
  // at once.  However, we haven't implemented that yet!  **We will soon.**
  // ATTN: with the introduction of dedicated resources (as priced right now), there are
  // products with an online discount (previously all of them) and without (dedicated).
  // Hence it's not possible to add up all prices and then add the discount for all
  // in a single invoice.
  const pool = getPool();
  for (const item of cart) {
    const license_id = await purchaseItem(item);
    await pool.query(
      "UPDATE shopping_cart_items SET purchased=$3 WHERE account_id=$1 AND id=$2",
      [account_id, item.id, { success: true, time: new Date(), license_id }]
    );
  }
}

async function purchaseItem(item): Promise<string> {
  const { product } = item;
  if (product != "site-license") {
    // This *ONLY* implements purchasing the site-license product, which is the only
    // one we have right now.
    throw Error("only the 'site-license' product is currently implemented");
  }
  return await purchaseSiteLicense(item);
}

async function purchaseSiteLicense(item: {
  account_id: string;
  description: SiteLicenseDescriptionDB;
}): Promise<string> {
  const info = getPurchseInfo(item.description);
  info.cost = compute_cost(info);
  return await purchaseLicense(item.account_id, info, true); // true = no throttle; otherwise, only first item would get bought.
}

function getPurchseInfo(description: SiteLicenseDescriptionDB): PurchaseInfo {
  const conf = description; // name clash with "desription.description"
  conf.type = conf.type ?? "quota"; // backwards compatibility
  switch (conf.type) {
    case "quota":
      const {
        type,
        title,
        description,
        user,
        run_limit,
        period,
        range,
        ram,
        cpu,
        disk,
        member,
        uptime,
      } = conf;

      return {
        type, // "quota"
        user,
        upgrade: "custom" as "custom",
        quantity: run_limit,
        subscription: (period == "range" ? "no" : period) as Subscription,
        start: range?.[0] ? new Date(range?.[0]) : new Date(),
        end: range?.[1] ? new Date(range?.[1]) : undefined,
        custom_ram: ram,
        custom_dedicated_ram: 0,
        custom_cpu: cpu,
        custom_dedicated_cpu: 0,
        custom_disk: disk,
        custom_member: member,
        custom_uptime: uptime,
        title,
        description,
      };

    case "vm":
      if (conf.range[0] == null || conf.range[1] == null) {
        throw new Error(
          `start/end range must be defined -- range=${JSON.stringify(
            conf.range
          )}`
        );
      }
      return {
        type: "vm",
        quantity: 1,
        dedicated_vm: conf.dedicated_vm,
        subscription: "no",
        start: new Date(conf.range[0]),
        end: new Date(conf.range[1]),
      };

    case "disk":
      return {
        type: "disk",
        quantity: 1,
        dedicated_disk: conf.dedicated_disk,
        subscription: conf.period,
      };
  }
}
