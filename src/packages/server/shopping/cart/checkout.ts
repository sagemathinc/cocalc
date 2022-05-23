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

import getPool from "@cocalc/database/pool";
import purchaseLicense from "@cocalc/server/licenses/purchase";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import {
  PurchaseInfo,
  Subscription,
} from "@cocalc/util/licenses/purchase/types";
import { Date0 } from "@cocalc/util/types/store";
import { SiteLicenseDescriptionDB } from "@cocalc/util/upgrades/shopping";
import getCart from "./get";

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

/**
 * We not only preprocess the date range, but also play nice to the user. if the start date is before the current time,
 * which happens when you order something that is supposed to start "now" (and is corrected to the start of the day in the user's time zone),
 * then append that period that's already in the past to the end of the range.
 */
function fixRange(rangeOrig?: [Date0 | string, Date0 | string]): [Date, Date0] {
  if (rangeOrig == null) {
    return [new Date(), undefined];
  }

  let [start, end]: [Date, Date0] = [
    rangeOrig?.[0] ? new Date(rangeOrig?.[0]) : new Date(),
    rangeOrig?.[1] ? new Date(rangeOrig?.[1]) : undefined,
  ];

  if (start != null && end != null) {
    const serverTime = new Date();
    if (start < serverTime) {
      const diff = serverTime.getTime() - start.getTime();
      end = new Date(end.getTime() + diff);
      // we don't care about changing fixedStart, because it's already in the past
    }
  }
  return [start, end];
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
        ram,
        cpu,
        disk,
        member,
        uptime,
        boost = false,
      } = conf;
      const rangeQuota = fixRange(conf.range);
      return {
        type, // "quota"
        user,
        upgrade: "custom" as "custom",
        quantity: run_limit,
        subscription: (period == "range" ? "no" : period) as Subscription,
        start: rangeQuota[0],
        end: rangeQuota[1],
        custom_ram: ram,
        custom_dedicated_ram: 0,
        custom_cpu: cpu,
        custom_dedicated_cpu: 0,
        custom_disk: disk,
        custom_member: member,
        custom_uptime: uptime,
        boost,
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
      const rangeVM = fixRange(conf.range);
      return {
        type: "vm",
        quantity: 1,
        dedicated_vm: conf.dedicated_vm,
        subscription: "no",
        start: rangeVM[0],
        end: rangeVM[1],
        title,
        description,
      };

    case "disk":
      return {
        type: "disk",
        quantity: 1,
        dedicated_disk: conf.dedicated_disk,
        subscription: conf.period,
        start: new Date(),
        title,
        description,
      };
  }
}
