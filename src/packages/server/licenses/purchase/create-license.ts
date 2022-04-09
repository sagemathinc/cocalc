/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import type { PostgreSQL } from "@cocalc/database/postgres/types";
import { PurchaseInfo } from "@cocalc/util/licenses/purchase/util";
import { v4 as uuid } from "uuid";
import { getLogger } from "@cocalc/backend/logger";
const logger = getLogger("createLicense");

// ATTN: activates/expires timestamps only work correctly if server set to UTC timezone.
// for specific intervals, the activates/expires start/end dates should be at the start/end of the day in the user's timezone.
// this is done while selecting the time interval – here, server side, we no longer know the user's time zone.
export default async function createLicense(
  database: PostgreSQL,
  account_id: string,
  info: PurchaseInfo
): Promise<string> {
  const license_id = uuid();
  logger.debug("creating a license...", license_id, info);
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
      always_running: info.custom_uptime === "always_running",
      idle_timeout: info.custom_uptime,
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
