/*
Returns information about a given license, which
the user with the given account is *allowed* to get.
*/

import getPool from "@cocalc/database/pool";
import { toEpoch } from "@cocalc/database/postgres/util";
import { isValidUUID } from "@cocalc/util/misc";
import { License as FullLicense } from "./get-managed";
export type License = Partial<FullLicense>;

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

export default async function getLicense(
  license_id: string,
  account_id?: string
): Promise<License | undefined> {
  const pool = getPool();
  const query = (await isManager(license_id, account_id))
    ? `SELECT id, title, description,
    expires, activates, last_used,
    managers, upgrades, quota, run_limit
    FROM site_licenses WHERE $1=id`
    : `SELECT title, expires, activates, upgrades, quota, run_limit
    FROM site_licenses WHERE $1=id`;
  const { rows } = await pool.query(query, [license_id]);
  if (rows.length == 0) {
    throw Error(`no license with id ${license_id}`);
  }
  toEpoch(rows, ["expires", "activates", "last_used"]);
  return rows[0];
}
