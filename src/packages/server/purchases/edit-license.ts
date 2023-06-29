import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
import { cloneDeep } from "lodash";
import { compute_cost } from "@cocalc/util/licenses/purchase/compute-cost";
import type { PurchaseInfo } from "@cocalc/util/licenses/purchase/types";
import { isManager } from "@cocalc/server/licenses/get-license";

const logger = getLogger("purchases:edit-license");

interface Options {
  account_id: string;
  license_id: string;
  end?: Date;
}

export default async function editLicense(opts: Options) {
  const { account_id, license_id, end } = opts;
  logger.debug("editLicense", opts);
  if (!(await isManager(license_id, account_id))) {
    throw Error(`${account_id} must be a manager of ${license_id}`);
  }

  // Get data about current license. See below.
  const info = await getPurchaseInfo(license_id);
  logger.debug("editLicense", { info });
  if (info.type == "vouchers") {
    throw Error("bug -- a license for vouchers makes no sense");
  }

  // Make copy of data with modified params.
  const modifiedInfo = cloneDeep(info);
  if (end != null) {
    // @ts-ignore: TODO!
    modifiedInfo.end = end;
  }
  logger.debug("editLicense", { modifiedInfo });

  // Determine price for the change
  const price = compute_cost(info);
  const modifiedPrice = compute_cost(modifiedInfo);
  logger.debug("editLicense", { price, modifiedPrice });

  // Make purchase

  // Change license
}

async function getPurchaseInfo(license_id: string): Promise<PurchaseInfo> {
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
