/*
Edit an existing license.  Most changes are allowed, and the user is charged
or credited for the requested changes.

** ONLY the user that purchased the license can edit it. **
Justification: They can easily make a purchase, then let another user
manage the license, and the other user could then edit it and get all
the remaining money.  Imagine a $20K university purchase for a single
license.

Some interesting notes and special cases:

- One special case is when a subscription changes a license by updating the end date.  Subscriptions
  have a fixed cost associated with them, and that is explicitly passed in to ensure that even if rates
  go up, users still get the subscription price. Also, the price each month is the same, even though
  the number of days in a month varies.

- Another special case is editing a license that happens to be associated to a subscription. When this
  happens, we update the cost of the subscription.  Otherwise, the user could change the license to
  be much more expensive, but still get the subscription rate.
*/

import getPool, {
  getTransactionClient,
  PoolClient,
} from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import costToEditLicense, {
  Changes,
} from "@cocalc/util/purchases/cost-to-edit-license";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import { getQuota } from "@cocalc/server/licenses/purchase/create-license";
import getName from "@cocalc/server/accounts/get-name";
import { query_projects_using_site_license } from "@cocalc/database/postgres/site-license/analytics";
import { restartProjectIfRunning } from "@cocalc/server/projects/control/util";
import { currency } from "@cocalc/util/misc";
import { hoursInInterval } from "@cocalc/util/stripe/timecalcs";
import { assertPurchaseAllowed } from "./is-purchase-allowed";
import createPurchase from "./create-purchase";

const logger = getLogger("purchases:edit-license");

interface Options {
  account_id: string;
  license_id: string;
  changes: Changes;
  cost?: number;
  note?: string;
  // set to true if this is a subscription renewal.
  isSubscriptionRenewal?: boolean;
  client?: PoolClient;
  // If force is true, we allow the purchase even if it exceeds any quotas.
  // Used for automatic subscription renewal.
  force?: boolean;
}

export default async function editLicense(
  opts: Options,
): Promise<{ purchase_id?: number; cost: number }> {
  let { changes } = opts;

  // dates json to strings, of course -- this caused https://github.com/sagemathinc/cocalc/issues/7258
  if (changes.start) {
    changes.start = new Date(changes.start);
  }
  if (changes.end) {
    changes.end = new Date(changes.end);
  }
  const {
    account_id,
    license_id,
    cost: cost0,
    isSubscriptionRenewal = false,
    force,
  } = opts;
  logger.debug("editLicense", opts);

  const {
    cost: changeCost,
    info,
    modifiedInfo,
  } = await costToChangeLicense({
    license_id,
    isSubscriptionRenewal,
    changes,
  });
  if (info.type == "vouchers" || modifiedInfo.type == "vouchers") {
    throw Error("editing voucher licenses is not supported");
  }
  const owner_id = (info as any).account_id;
  if (owner_id != account_id) {
    // account_id isn't defined in the schema for PurchaseInfo,
    // but we do set it when making the license via a normal purchase.
    // There are licenses without it set, e.g., manually test licenses
    // made by admins, but those are exactly the sort of thing users
    // should not be able to edit.
    if (owner_id == null) {
      throw Error("this license does not support editing");
    } else {
      throw Error(
        `Only the user who purchased a license is allowed to edit it. This license was purchased by ${await getName(
          owner_id,
        )}.`,
      );
    }
  }

  const service = "edit-license";

  // If a cost is explicitly passed in, then we use that.
  // This happens for subscriptions.
  const cost = cost0 ? cost0 : changeCost;
  let note = opts.note ?? "";
  if (note != "") {
    note += " ";
  }
  if (cost0) {
    note += `We use the fixed cost ${currency(Math.abs(cost))}.`;
  } else {
    note += `We use the current prorated cost ${currency(Math.abs(cost))}.`;
  }

  logger.debug("editLicense -- cost to make the edit: ", cost, modifiedInfo);

  // Changing the license and creating the purchase are a single PostgreSQL atomic transaction.

  // start atomic transaction (unless one passed in)
  const client = opts.client ?? (await getTransactionClient());
  let purchase_id;
  try {
    // Is it possible for this user to purchase this change?
    if (cost > 0) {
      try {
        await assertPurchaseAllowed({ account_id, service, cost, client });
      } catch (err) {
        if (!force) {
          throw err;
        }
      }
    }

    // Change license
    await changeLicense(license_id, modifiedInfo, client);

    if (Math.abs(cost) > 0.005) {
      // we only create a charge if it is bigger than epsilon in absolute value.

      // Make purchase
      const description = {
        type: "edit-license",
        license_id,
        origInfo: info,
        modifiedInfo,
        note,
      } as const;
      // when editing a license, the part the period the payment
      // applies to is always >= now.  This period_start/period_end
      // is so far entirely for accounting (i.e., understanding *when*
      // a purchase is for to better compute accrued revenue).
      if (modifiedInfo.start == null) {
        throw Error("start of modifiedInfo must be set");
      }
      const period_start = new Date(
        Math.max(modifiedInfo.start.valueOf(), Date.now()),
      );
      if (modifiedInfo.end == null) {
        throw Error("end of modifiedInfo must be set");
      }
      const period_end = modifiedInfo.end;

      purchase_id = await createPurchase({
        account_id,
        service,
        description,
        cost,
        client,
        period_start,
        period_end,
        tag: isSubscriptionRenewal ? "subscription" : "edit",
      });
    }

    if (!isSubscriptionRenewal) {
      // Update subscription cost, if necessary.  This is the case when the user edits the underlying license
      // that the subscription is for. This is NOT a subscription renewal.
      await updateSubscriptionCost(
        license_id,
        info,
        modifiedInfo,
        changes,
        client,
      );
    }

    if (opts.client == null) {
      await client.query("COMMIT");
    }
  } catch (err) {
    if (opts.client == null) {
      logger.debug("editLicense -- error -- reverting transaction", err);
      await client.query("ROLLBACK");
    }
    throw err;
  } finally {
    if (opts.client == null) {
      // end atomic transaction
      client.release();
    }
  }

  if (requiresRestart(info, changes)) {
    logger.debug(
      "editLicense -- restarting all projects that are using the license",
      license_id,
    );
    // don't block returning on this
    (async () => {
      try {
        await restartProjectsUsingLicense(license_id);
        logger.debug(
          "editLicense -- DONE restarting all projects that are using the license",
          license_id,
        );
      } catch (err) {
        console.trace(err);
        logger.debug(
          "editLicense -- ERROR restarting all projects that are using the license",
          license_id,
          `${err}`,
        );
      }
    })();
  }
  return { cost, purchase_id };
}

export async function costToChangeLicense({
  license_id,
  isSubscriptionRenewal,
  changes,
}: {
  license_id: string;
  isSubscriptionRenewal?: boolean;
  changes: Changes;
}): Promise<{
  info: PurchaseInfo;
  cost: number;
  modifiedInfo: PurchaseInfo;
}> {
  // Get data about current license. See below.
  const info = await getPurchaseInfo(license_id);
  logger.debug("costToChangeLicense", { info, isSubscriptionRenewal, changes });
  if (info.type == "vouchers") {
    throw Error("editing voucher licenses is not supported");
  }
  if (info.start == null || info.end == null) {
    throw Error("start and end of license must be set");
  }
  if (
    !isSubscriptionRenewal &&
    info.subscription != null &&
    info.subscription != "no"
  ) {
    if (changes.start != null || changes.end != null) {
      throw Error(
        "editing the start or end dates of a subscription license is not allowed",
      );
    }
  }
  if (
    changes.start == null &&
    changes.end != null &&
    changes.end < info.start
  ) {
    // if changing end to be before start, just reset start to
    // also equal end -- the result will of course cost 0.
    changes = { ...changes, start: changes.end };
  }

  const { cost, modifiedInfo } = costToEditLicense(info, changes);
  logger.debug("costToChangeLicense", { info, changes, cost, modifiedInfo });
  if (modifiedInfo.type != info.type) {
    throw Error("bug");
  }

  return { cost, info, modifiedInfo };
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
  if (
    changes.start &&
    info.start &&
    !(info.start > now && changes.start > now)
  ) {
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

export async function changeLicense(
  license_id: string,
  info: PurchaseInfo,
  client: PoolClient,
) {
  // logger.debug("changeLicense -- ", { license_id, info });

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
    ],
  );
}

async function updateSubscriptionCost(
  license_id: string,
  info: PurchaseInfo,
  modifiedInfo: PurchaseInfo,
  changes: Changes,
  client: PoolClient,
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
      info,
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
    [license_id],
  );
  const subscription_id = rows[0]?.subscription_id;
  if (!subscription_id) {
    // no subscription
    logger.debug("updateSubscriptionCost", license_id, "no subscription id");
    return;
  }
  // Current subscription cost for modified license.
  // Note that we MUST unset the start/end dates since otherwise they would
  // be used in compute_cost!
  if (modifiedInfo.type != "quota") {
    throw Error("bug");
  }
  const newCost = compute_cost({
    ...modifiedInfo,
    start: null,
    end: null,
  }).cost;
  logger.debug(
    "updateSubscriptionCost",
    license_id,
    "changing cost to",
    newCost,
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
  license_id: string,
): Promise<PurchaseInfo & { account_id: string }> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT info->'purchased' as info, activates, expires, subscription_id FROM site_licenses WHERE id=$1",
    [license_id],
  );
  if (rows.length == 0) {
    throw Error(`no license with id ${license_id}`);
  }
  const { info, activates, expires, subscription_id } = rows[0];
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
  if (subscription_id != null) {
    // this is a subscription license, so include the cost from the subscription
    info.cost_per_hour = await getSubscriptionCostPerHour(subscription_id);
  }

  return info;
}

async function getSubscriptionCostPerHour(
  subscription_id: number,
): Promise<number> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT cost, interval FROM subscriptions WHERE id=$1",
    [subscription_id],
  );
  if (rows.length == 0) {
    // should never happen: returns 0 if no such subscription, instead of an error.
    return 0;
  }
  return rows[0].cost / hoursInInterval(rows[0].interval);
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
  cost_per_project_per_month: 19.232,
  cost_sub_month: 17.3088,
  cost_sub_year: 196.16639999999998
}

*/
