/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PostgreSQL } from "../../postgres/types";
import { PurchaseInfo } from "smc-webapp/site-licenses/purchase/util";
import { v4 as uuid } from "node-uuid";

export async function create_license(
  database: PostgreSQL,
  account_id: string,
  info: PurchaseInfo,
  dbg: (...args) => void
): Promise<string> {
  dbg(`creating a license... info=${JSON.stringify(info)}`);
  const license_id = uuid();
  const values: { [key: string]: any } = {
    "id::UUID": license_id,
    "info::JSONB": {
      purchased: { account_id, ...info },
    },
    "activates::TIMESTAMP":
      info.subscription != "no"
        ? new Date(new Date().valueOf() - 60000) // one minute in past to avoid any funny confusion.
        : info.start,
    "created::TIMESTAMP": new Date(),
    "managers::TEXT[]": [account_id],
    "quota::JSONB": {
      user: info.user,
      ram: info.custom_ram,
      cpu: info.custom_cpu,
      dedicated_ram: info.custom_dedicated_ram,
      dedicated_cpu: info.custom_dedicated_cpu,
      disk: info.custom_disk,
      always_running: info.custom_always_running,
      member: info.custom_member,
    },
    "title::TEXT": info.title,
    "description::TEXT": info.description,
    "run_limit::INTEGER": info.quantity,
  };
  if (info.end != null) {
    values["expires::TIMESTAMP"] = info.end;
  }

  await database.async_query({
    query: "INSERT INTO site_licenses",
    values,
  });

  return license_id;
}
