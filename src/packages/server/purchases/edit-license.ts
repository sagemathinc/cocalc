import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import { isManager } from "@cocalc/server/licenses/get-license";
import costToEditLicense, {
  Changes,
} from "@cocalc/util/purchases/cost-to-edit-license";
import { getQuota } from "@cocalc/server/licenses/purchase/create-license";
import { assertPurchaseAllowed } from "./is-purchase-allowed";
import createPurchase from "./create-purchase";
import getName from "@cocalc/server/accounts/get-name";
import { query_projects_using_site_license } from "@cocalc/database/postgres/site-license/analytics";
import { restartProjectIfRunning } from "@cocalc/server/projects/control/util";

const logger = getLogger("purchases:edit-license");

interface Options {
  account_id: string;
  license_id: string;
  changes: Changes;
}

export default async function editLicense(
  opts: Options
): Promise<{ purchase_id: number; cost: number }> {
  const { account_id, license_id, changes } = opts;
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

  const { cost, modifiedInfo } = costToEditLicense(info, changes);
  logger.debug("editLicense -- cost to make the edit: ", cost, modifiedInfo);

  const service = "edit-license";
  // Is it possible for this user to purchase this change?
  if (cost > 0) {
    await assertPurchaseAllowed({ account_id, service, cost });
  }

  // [ ] TODO: make changing the license and creating the purchase a single atomic transaction

  // Change license
  await changeLicense(license_id, modifiedInfo);

  // Make purchase
  const description = {
    type: "edit-license",
    license_id,
    origInfo: info,
    modifiedInfo,
  } as const;
  const purchase_id = await createPurchase({
    account_id,
    service,
    description,
    cost,
  });

  // If changes is anything except only changing the end date to be in the future,
  // then we restart all projects using the license.  Changing the end date is one
  // thing that happens when updating subscriptions, and those need to be non-intrusive.
  const keys = Object.keys(changes);
  if (
    keys.length == 0 ||
    (keys.length == 1 &&
      keys[0] == "end" &&
      changes.end != null &&
      changes.end >= (info.end ?? new Date()))
  ) {
    // no need to restart
    logger.debug(
      "editLicense -- only change was to extend the end date, so not restarting any projects"
    );
  } else {
    logger.debug(
      "editLicense -- restarting all projects that are using the license",
      license_id
    );
    // don't block returning on this
    (async () => {
      try {
        await restartProjectsUsingLicense(license_id);
        logger.debug(
          "editLicense -- DONE restarting all projects that are the license",
          license_id
        );
      } catch (err) {
        logger.debug(
          "editLicense -- ERROR restarting all projects that are the license",
          license_id,
          err
        );
      }
    })();
  }

  return { cost, purchase_id };
}

async function changeLicense(license_id: string, info: PurchaseInfo) {
  if (info.type == "vouchers") {
    throw Error("BUG -- info.type must not be vouchers");
  }
  const quota = getQuota(info, license_id);
  const pool = getPool();
  await pool.query(
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

export async function getPurchaseInfo(
  license_id: string
): Promise<PurchaseInfo> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT info->'purchased' AS info FROM site_licenses WHERE id=$1",
    [license_id]
  );
  if (rows.length == 0) {
    throw Error(`no license with id ${license_id}`);
  }
  const { info } = rows[0];
  if (info.start != null) {
    info.start = new Date(info.start);
  }
  if (info.end != null) {
    info.end = new Date(info.end);
  }
  return info;
}

async function restartProjectsUsingLicense(license_id: string) {
  const query = query_projects_using_site_license(license_id);
  const pool = getPool();
  const { rows } = await pool.query(`SELECT project_id ${query}`);
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
