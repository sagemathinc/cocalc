/*
Returns information about a given license, which
the user with the given account is *allowed* to get.
*/

import getPool from "@cocalc/database/pool";
import { toEpoch } from "@cocalc/database/postgres/util";
import { numberRunningQuery } from "@cocalc/database/postgres/site-license/analytics";
import { isValidUUID } from "@cocalc/util/misc";
import { License as FullLicense } from "./get-managed";

export async function isManager(
  license_id: string,
  account_id?: string
): Promise<boolean> {
  if (!isValidUUID(account_id)) {
    return false;
  }
  const pool = getPool("short");
  const { rows } = await pool.query(
    "SELECT COUNT(*) AS count FROM site_licenses WHERE id=$1 AND $2=ANY(managers)",
    [license_id, account_id]
  );
  return rows[0].count > 0;
}

export interface License extends Partial<FullLicense> {
  number_running?: number; // in some cases this can be filled in.
  is_manager: boolean;
}

export default async function getLicense(
  license_id: string,
  account_id?: string
): Promise<License> {
  const pool = getPool();
  const is_manager = await isManager(license_id, account_id);
  const query = is_manager
    ? `SELECT id, title, description,
    expires, activates, last_used,
    managers, upgrades, quota, run_limit, info
    FROM site_licenses WHERE $1=id`
    : `SELECT title, expires, activates, upgrades, quota, run_limit
    FROM site_licenses WHERE $1=id`;
  const { rows } = await pool.query(query, [license_id]);
  if (rows.length == 0) {
    throw Error(`no license with id ${license_id}`);
  }
  toEpoch(rows, ["expires", "activates", "last_used"]);
  rows[0].is_manager = is_manager;
  if (is_manager) {
    const nr = await pool.query(numberRunningQuery(license_id));
    rows[0].number_running = nr.rows[0].count;
  }
  return rows[0];
}
