/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import getPool, { PoolClient } from "@cocalc/database/pool";
import { getLogger } from "@cocalc/backend/logger";
import { PurchaseInfo } from "@cocalc/util/purchases/quota/types";
import { adjustDateRangeEndOnSameDay } from "@cocalc/util/stripe/timecalcs";
import { v4 as uuid } from "uuid";
import dayjs from "dayjs";

const logger = getLogger("createLicense");

// ATTN: for specific intervals, the activates/expires start/end dates should be at the start/end of the day in the user's timezone.
// this is done while selecting the time interval – here, server side, we no longer know the user's time zone.
export default async function createLicense(
  account_id: string,
  info: PurchaseInfo,
  client?: PoolClient,
): Promise<string> {
  const pool = client ?? getPool();
  const license_id = uuid();
  logger.debug("creating a license...", license_id, info);
  if (info.type == "vouchers") {
    throw Error("purchaseLicense can't be used to purchase vouchers");
  }
  if (info.start == null || info.end == null) {
    throw Error("start and end must be defined");
  }
  // if start is slightly in the past, this shifts things over, leaving the
  // price unchanged, but maximizing value for the user.
  const [start, end] =
    info.subscription == "no"
      ? adjustDateRangeEndOnSameDay([info.start, info.end])
      : [info.start, info.end];

  await pool.query(
    `INSERT INTO site_licenses (id, info, activates, created, managers, quota, title, description, run_limit, expires)
     VALUES($1::UUID, $2::JSONB, $3::TIMESTAMP, NOW(), $4::TEXT[], $5::JSONB, $6::TEXT, $7::TEXT, $8::INTEGER, $9::TIMESTAMP)`,
    [
      license_id,
      {
        purchased: { account_id, ...info },
      },
      info.subscription != "no"
        ? dayjs().subtract(1, "minute").toDate() // one minute in past to avoid any funny confusion.
        : start,
      [account_id],
      getQuota(info),
      info.title,
      info.description,
      info.quantity,
      end,
    ],
  );
  return license_id;
}

// this constructs the "quota" object for the license,
// while it also sanity checks all fields. Last chance to find a problem!
export function getQuota(info: PurchaseInfo) {
  switch (info.type) {
    case "quota":
      return {
        user: info.user,
        ram: info.custom_ram,
        cpu: info.custom_cpu,
        dedicated_ram: info.custom_dedicated_ram,
        dedicated_cpu: info.custom_dedicated_cpu,
        disk: info.custom_disk,
        always_running: info.custom_uptime === "always_running",
        idle_timeout: info.custom_uptime,
        member: info.custom_member,
        boost: info.boost ?? false,
      };
    default:
      throw new Error(`unsupported license type "${info.type}"`);
  }
}
