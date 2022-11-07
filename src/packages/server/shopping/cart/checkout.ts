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

import { db } from "@cocalc/database";
import getPool from "@cocalc/database/pool";
import purchaseLicense from "@cocalc/server/licenses/purchase";
import { restartProjectIfRunning } from "@cocalc/server/projects/control/util";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import {
  PurchaseInfo,
  Subscription,
} from "@cocalc/util/licenses/purchase/types";
import { isValidUUID } from "@cocalc/util/misc";
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

  let restartProjects: Set<string> = new Set();

  for (const item of cart) {
    const { project_id, id } = item;
    const license_id = await purchaseItem(item);
    await pool.query(
      "UPDATE shopping_cart_items SET purchased=$3 WHERE account_id=$1 AND id=$2",
      [account_id, id, { success: true, time: new Date(), license_id }]
    );

    if (typeof project_id == "string" && isValidUUID(project_id)) {
      await db().add_license_to_project(project_id, license_id);
      restartProjects.add(project_id);
    }
  }

  // there could be several licenses, added to the same or different projects,
  // hence at the end we kick of a restart for each one of these projects once
  for (const pid of restartProjects) {
    restartProjectIfRunning(pid); // we don't wait on this, could take a while…
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
  const info = getPurchaseInfo(item.description);
  info.cost = compute_cost(info);
  return await purchaseLicense(item.account_id, info, true); // true = no throttle; otherwise, only first item would get bought.
}

// make sure start/end is properly defined
// later, when actually saving the range to the database, we will maybe append a portion of the start which is in the past
function fixRange(rangeOrig?: [Date0 | string, Date0 | string]): [Date, Date0] {
  if (rangeOrig == null) {
    return [new Date(), undefined];
  }

  const [start, end]: [Date, Date0] = [
    rangeOrig?.[0] ? new Date(rangeOrig?.[0]) : new Date(),
    rangeOrig?.[1] ? new Date(rangeOrig?.[1]) : undefined,
  ];

  return [start, end];
}

function getPurchaseInfo(conf: SiteLicenseDescriptionDB): PurchaseInfo {
  conf.type = conf.type ?? "quota"; // backwards compatibility

  const { title, description } = conf;

  switch (conf.type) {
    case "quota":
      const {
        type,
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
