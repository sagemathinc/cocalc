/*
Returns array of licenses that a given user manages.
*/

import getPool from "@cocalc/database/pool";
import { toEpoch } from "@cocalc/database/postgres/util";
import { isValidUUID } from "@cocalc/util/misc";

export interface License {
  id: string;
  title: string;
  description: string;
  expires?: number;
  activates: number;
  created: number;
  last_used: number;
  managers: string[];
  upgrades?: {
    cores: number;
    cpu_shares: number;
    disk_quota: number;
    memory: number;
    mintime: number;
    network: number;
  };
  quota?: {
    ram: number;
    cpu: number;
    disk: number;
    always_running: boolean;
    member: boolean;
    user: "academic" | "business";
  };
  run_limit: number;
}

export default async function getManagedLicenses(
  account_id: string
): Promise<License[]> {
  if (!isValidUUID(account_id)) {
    throw Error("invalid account_id -- must be a uuid");
  }

  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT id, title, description,
    expires, activates, last_used,
    managers, upgrades, quota, run_limit
    FROM site_licenses WHERE $1=ANY(managers)`,
    [account_id]
  );
  toEpoch(rows, ["expires", "activates", "last_used"]);
  return rows;
}
