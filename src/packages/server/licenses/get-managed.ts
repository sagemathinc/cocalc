/*
Returns array of licenses that a given user manages.
*/

import getPool from "@cocalc/database/pool";
import { toEpoch } from "@cocalc/database/postgres/util";
import { isValidUUID } from "@cocalc/util/misc";
import type { License } from "@cocalc/util/db-schema/site-licenses";
export type { License };

export default async function getManagedLicenses(
  account_id: string
): Promise<License[]> {
  if (!isValidUUID(account_id)) {
    throw Error("invalid account_id -- must be a uuid");
  }

  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT id, title, description,
    expires, activates, last_used, created,
    managers, upgrades, quota, run_limit, info
    FROM site_licenses WHERE $1=ANY(managers) ORDER BY created DESC`,
    [account_id]
  );
  toEpoch(rows, ["expires", "activates", "last_used", "created"]);
  for (const row of rows) {
    row.is_manager = true;
  }
  return rows;
}
