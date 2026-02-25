/*
Returns information about a given license, which
the user with the given account is *allowed* to get.
*/

import getPool from "@cocalc/database/pool";
import { toEpoch } from "@cocalc/database/postgres/utils/to-epoch";
import { numberRunningQuery } from "@cocalc/database/postgres/site-license/analytics";
import { isValidUUID } from "@cocalc/util/misc";
import type { LicenseFromApi } from "@cocalc/util/db-schema/site-licenses";

export async function isManager(
  license_id: string,
  account_id?: string,
): Promise<boolean> {
  if (!isValidUUID(account_id)) {
    return false;
  }
  const pool = getPool("short");
  const { rows } = await pool.query(
    "SELECT COUNT(*)::INT AS count FROM site_licenses WHERE id=$1 AND $2=ANY(managers)",
    [license_id, account_id],
  );
  return rows[0].count > 0;
}

export default async function getLicense(
  license_id: string,
  account_id?: string,
): Promise<LicenseFromApi> {
  const pool = getPool();
  const is_manager = await isManager(license_id, account_id);
  const query = is_manager
    ? `SELECT id, title, description,
    expires, activates, last_used,
    managers, upgrades, quota, run_limit, info, subscription_id
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

export async function getLicenseBySubscriptionId(
  subscription_id: string,
  account_id: string,
): Promise<LicenseFromApi> {
  const pool = getPool();
  const query = `SELECT id, title, description,
    expires, activates, last_used,
    managers, upgrades, quota, run_limit, info, subscription_id
    FROM site_licenses WHERE subscription_id=$1 AND $2=ANY(managers)`;
  const { rows } = await pool.query(query, [subscription_id, account_id]);
  if (rows.length == 0) {
    throw Error(
      `You are not the manager of any license with subscription id=${subscription_id}`,
    );
  }
  const license = rows[0];
  toEpoch([license], ["expires", "activates", "last_used"]);
  license.is_manager = true;
  const nr = await pool.query(numberRunningQuery(license.id));
  license.number_running = nr.rows[0].count;
  return license;
}
