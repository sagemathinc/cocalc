/*
Edit an existing license.  Most changes are allowed, and the user is automatically charged for
the requested changes.

Some interesting notes and special cases:

- One special case is when a subscription changes a license by updating the end date.  Subscriptions
  have a fixed cost associated with them, and that is explicitly passed in to ensure that even if rates
  go up, users still get the subscription price. Also, the price each month is the same, even though
  the number of days in a month varies.

- Another special case is editing a license that happens to be associated to a subscription. When this
  happens, we update the cost of the subscription.  Otherwise, the user could change the license to
  be much more expensive, but still get the subscription rate.
*/

import getPool, { getTransactionClient, PoolClient } from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import { isManager } from "@cocalc/server/licenses/get-license";
import costToEditLicense, {
  Changes,
} from "@cocalc/util/purchases/cost-to-edit-license";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import { getQuota } from "@cocalc/server/licenses/purchase/create-license";
import { assertPurchaseAllowed } from "./is-purchase-allowed";
import createPurchase from "./create-purchase";
import getName from "@cocalc/server/accounts/get-name";
import { query_projects_using_site_license } from "@cocalc/database/postgres/site-license/analytics";
import { restartProjectIfRunning } from "@cocalc/server/projects/control/util";
import { currency } from "./util";

const logger = getLogger("purchases:edit-license");

interface Options {
  account_id: string;
  license_id: string;
  changes: Changes;
  cost?: number;
  note?: string;
  isSubscriptionRenewal?: boolean; // set to true if this is a subscription renewal.
}

export default async function editLicense(
  opts: Options
): Promise<{ purchase_id: number; cost: number }> {
  const {
    account_id,
    license_id,
    changes,
    cost: cost0,
    isSubscriptionRenewal = false,
  } = opts;
  logger.debug("editLicense", opts);
  if (!(await isManager(license_id, account_id))) {
    throw Error(`${account_id} must be a manager of ${license_id}`);
  }

  // Get data about current license. See below.
  const info = await getPurchaseInfo(license_id);
  logger.debug("editLicense -- initial info = ", info);
  if (info.type == "vouchers") {
    throw Error("editing vouchers is not supported");
  }
  if (
    !isSubscriptionRenewal &&
    info.subscription != null &&
    info.subscription != "no"
  ) {
    if (changes.start != null || changes.end != null) {
      throw Error(
        "editing the start and end dates of a subscription license is not allowed"
      );
    }
  }

  // account_id isn't defined in the schema for PurchaseInfo,
  // but we do set it when making the license via a normal purchase.
  // There are licenses without it set, e.g., manually test licenses
  // made by admins, but those are exactly the sort of thing users
  // should not be able to edit.
  const owner_id = (info as any).account_id;
  if (owner_id != account_id) {
    if (owner_id == null) {
      throw Error("this license does not support editing");
    } else {
      throw Error(
        `Only the user who purchased a license is allowed to edit it. This license was purchased by ${await getName(
          owner_id
        )}.`
      );
    }
  }

  const { cost: changeCost, modifiedInfo } = costToEditLicense(info, changes);

  const service = "edit-license";

  // If a cost is explicitly passed in, then we use that.
  // This happens for subscriptions.
  const cost = cost0 ? cost0 : changeCost;
  let note = opts.note ?? "";
  if (note != "") {
    note += " ";
  }
  if (cost0) {
    note += `We use the fixed cost ${currency(cost)}.`;
  } else {
    note += `We use the current prorated cost ${currency(cost)}.`;
  }

  logger.debug("editLicense -- cost to make the edit: ", cost, modifiedInfo);

  // Changing the license and creating the purchase are a single PostgreSQL atomic transaction.

  // start atomic transaction
  const client = await getTransactionClient();
  let purchase_id;
  try {
    // Is it possible for this user to purchase this change?
    if (cost > 0) {
      await assertPurchaseAllowed({ account_id, service, cost, client });
    }
    
    // Change license
    await changeLicense(license_id, modifiedInfo, client);

    // Make purchase
    const description = {
      type: "edit-license",
      license_id,
      origInfo: info,
      modifiedInfo,
      note,
    } as const;
    purchase_id = await createPurchase({
      account_id,
      service,
      description,
      cost,
      client,
    });

    if (!isSubscriptionRenewal) {
      // Update subscription cost, if necessary
      await updateSubscriptionCost(
        license_id,
        info,
        modifiedInfo,
        changes,
        client
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    logger.debug("editLicense -- error -- reverting transaction", err);
    await client.query("ROLLBACK");
    throw err;
  } finally {
    // end atomic transaction
    client.release();
  }

  if (requiresRestart(info, changes)) {
    logger.debug(
      "editLicense -- restarting all projects that are using the license",
      license_id
    );
    // don't block returning on this
    (async () => {
      try {
        await restartProjectsUsingLicense(license_id);
        logger.debug(
          "editLicense -- DONE restarting all projects that are using the license",
          license_id
        );
      } catch (err) {
        console.trace(err);
        logger.debug(
          "editLicense -- ERROR restarting all projects that are using the license",
          license_id,
          `${err}`
        );
      }
    })();
  }
  return { cost, purchase_id };
}

/*
Restart except when changes *only* does the following:

- changes modifies the end date to be in the future
- changes increases the quantity
- start is in the future and changes modifies start to be a different date still in the future
*/
function requiresRestart(info: PurchaseInfo, changes: Changes): boolean {
  const now = new Date();
  if (Object.keys(changes).length == 0) {
    // no change so no need to restart
    return false;
  }
  if (info.type == "vouchers") {
    throw Error("not implemented for vouchers");
  }
  if (changes.end && changes.end <= now) {
    // moving end date back to before now -- clearly need to restart since license is now no longer valid
    return true;
  }
  if (changes.quantity && changes.quantity < info.quantity) {
    // reducing quantity -- need to restart since license won't work for some projects
    return true;
  }
  if (changes.start && !(info.start > now && changes.start > now)) {
    // changing start time in a way that isn't only in the future
    return true;
  }
  const handled = new Set(["end", "quantity", "start"]);
  // if anything besides end, quantity, and start are changed, then restart:
  for (const key in changes) {
    if (handled.has(key)) continue;
    if (info[key] != changes[key]) {
      return true; // changed something like custom_ram, etc.
    }
  }
  // survived the above, so no need to restart:
  return false;
}

async function changeLicense(
  license_id: string,
  info: PurchaseInfo,
  client: PoolClient
) {
  if (info.type == "vouchers") {
    throw Error("BUG -- info.type must not be vouchers");
  }
  const quota = getQuota(info, license_id);
  await client.query(
    "UPDATE site_licenses SET quota=$1,run_limit=$2,info=$3,expires=$4,activates=$5 WHERE id=$6",
    [
      quota,
      info.quantity,
      { purchased: info },
      (info as any).end,
      info.start,
      license_id,
    ]
  );
}

async function updateSubscriptionCost(
  license_id: string,
  info: PurchaseInfo,
  modifiedInfo: PurchaseInfo,
  changes: Changes,
  client: PoolClient
) {
  if (
    info.type == "vouchers" ||
    info.subscription == null ||
    info.subscription == "no"
  ) {
    logger.debug(
      "updateSubscriptionCost",
      license_id,
      "not a subscription",
      info
    );
    // no subscription associated to this license
    return;
  }
  let costChange = false;
  for (const key in changes) {
    if (key == "start" || key == "end") {
      continue;
    }
    if (info[key] != modifiedInfo[key]) {
      costChange = true;
      break;
    }
  }
  if (!costChange) {
    logger.debug("updateSubscriptionCost", license_id, "no relevant change");
    // no changes that would impact subscription cost
    return;
  }
  const { rows } = await client.query(
    "SELECT subscription_id FROM site_licenses WHERE id=$1",
    [license_id]
  );
  const subscription_id = rows[0]?.subscription_id;
  if (!subscription_id) {
    // no subscription
    logger.debug("updateSubscriptionCost", license_id, "no subscription id");
    return;
  }
  // current subscription cost for modified license.
  // note that the start/end dates aren't used in compute_cost
  // since subscription != 'no'.
  const newCost = compute_cost(modifiedInfo).discounted_cost;
  logger.debug(
    "updateSubscriptionCost",
    license_id,
    "changing cost to",
    newCost
  );
  await client.query("UPDATE subscriptions SET cost=$1 WHERE id=$2", [
    newCost,
    subscription_id,
  ]);
}

// Gets PurchaseInfo for this license, but with any modifications
// to the activates and expires timestamps made.   Those take precedence
// over whatever was used for the original purchase.
export async function getPurchaseInfo(
  license_id: string
): Promise<PurchaseInfo> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT info->'purchased' as info, activates, expires FROM site_licenses WHERE id=$1",
    [license_id]
  );
  if (rows.length == 0) {
    throw Error(`no license with id ${license_id}`);
  }
  const { info, activates, expires } = rows[0];
  if (activates != null) {
    info.start = activates;
  } else if (info.start != null) {
    info.start = new Date(info.start);
  }
  if (expires != null) {
    info.end = expires;
  } else {
    if (info.end != null) {
      info.end = new Date(info.end);
    }
  }
  return info;
}

async function restartProjectsUsingLicense(license_id: string) {
  const { query, params } = query_projects_using_site_license(license_id);
  const pool = getPool();
  const { rows } = await pool.query(`SELECT project_id ${query}`, params);
  for (const row of rows) {
    (async () => {
      await restartProjectIfRunning(row.project_id);
    })();
  }
}

/*
NOTES about how the above works.

Here's what a typical license record in the database looks like:

id           | 16536ef0-20a3-4573-b07e-8549446ade62
title        | 
description  | 
info         | {"purchased": {"end": "2023-07-27T06:59:59.999Z", "type": "quota", "user": "academic", "boost": false, "start": "2023-06-26T07:00:00.000Z", "upgrade": "custom", "quantity": 2, "account_id": "8e138678-9264-431c-8dc6-5c4f6efe66d8", "custom_cpu": 1, "custom_ram": 6, "custom_disk": 15, "subscription": "no", "custom_member": true, "custom_uptime": "medium", "custom_dedicated_cpu": 0, "custom_dedicated_ram": 0}}
expires      | 2023-07-30 00:26:49.619
activates    | 2023-06-26 07:00:00
created      | 2023-06-29 00:26:49.62
last_used    | 
managers     | {8e138678-9264-431c-8dc6-5c4f6efe66d8}
restricted   | 
upgrades     | 
quota        | {"cpu": 1, "ram": 6, "disk": 15, "user": "academic", "boost": false, "member": true, "idle_timeout": "medium", "dedicated_cpu": 0, "dedicated_ram": 0, "always_running": false}
run_limit    | 2
apply_limit  | 
voucher_code | 

The info.purchased JSONB thing, which above is this:

{
  end: '2023-07-27T06:59:59.999Z',
  type: 'quota',
  user: 'academic',
  boost: false,
  start: '2023-06-26T07:00:00.000Z',
  upgrade: 'custom',
  quantity: 2,
  account_id: '8e138678-9264-431c-8dc6-5c4f6efe66d8',
  custom_cpu: 1,
  custom_ram: 6,
  custom_disk: 15,
  subscription: 'no',
  custom_member: true,
  custom_uptime: 'medium',
  custom_dedicated_cpu: 0,
  custom_dedicated_ram: 0
}

and this is an object of type PurchaseInfo.  This PurchaseInfo is complicated
because there are several very different types:

 - 'quota', 'vouchers', 'vm', 'disk'.

Editing 'vouchers' isn't supported - there should be no possible way a license would have that type.

The function compute_cost defined in

    packages/util/licenses/purchase/compute-cost.ts
    
takes as input a PurchaseInfo object and outputs this sort of object:

{ 
  cost_per_unit: 19.547278681226473,  
  cost: 39.094557362452946,  
  discounted_cost: 39.094557362452946,
  cost_per_project_per_month: 19.232,
  cost_sub_month: 17.3088,
  cost_sub_year: 196.16639999999998
}

*/
