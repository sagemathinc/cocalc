/*
Given an account_id, returns an "internal profile" that provides a package  of
useful information about a user that can be used across cocalc, etc.,
to better inform how the system helps them.

This data is available to that user (i.e., so their browser can better
be customized to how they have used cocalc so far), and also to admins.

This can be slightly expensive to compute, but is cached and computed at most
once per day.
*/

import type { UsageProfile } from "@cocalc/util/db-schema/usage-profiles";
import getPool from "@cocalc/database/pool";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { SQL } from "sql-template-strings";

export const getUsageProfile = reuseInFlight(
  async ({ account_id }: { account_id: string }): Promise<UsageProfile> => {
    const pool = getPool();
    const { rows } = await pool.query(
      SQL`SELECT * FROM usage_profiles WHERE account_id=${account_id} AND time > NOW() - INTERVAL '1 day'`,
    );
    if (rows.length > 0) {
      return rows[0] as UsageProfile;
    }
    const usageProfile = await computeUsageProfile(account_id);
    await pool.query(
      SQL`INSERT INTO usage_profiles(account_id,time,total_purchases,total_file_access) VALUES(${account_id},${usageProfile.time},${usageProfile.total_purchases},${usageProfile.total_file_access})`,
    );
    return usageProfile;
  },
);

async function computeUsageProfile(account_id: string) {
  const pool = getPool();
  const time = new Date();
  const x = { time, account_id } as Partial<UsageProfile>;

  // get credits
  const credit = await pool.query(
    SQL`SELECT SUM(cost) AS total, service FROM purchases WHERE account_id=${account_id} AND time <= ${time} GROUP BY service`,
  );
  x.total_purchases = {};
  for (const { service, total } of credit.rows) {
    x.total_purchases[service] = total;
  }

  // skips empty extension
  const file_access = await pool.query(
    "SELECT COUNT(*) AS total, substring(filename FROM '.([^.]*$)') AS extension FROM file_access_log WHERE account_id=$1 AND position('.' in filename) > 0 GROUP BY extension ORDER BY total DESC",
    [account_id],
  );
  x.total_file_access = {};
  for (const { extension, total } of file_access.rows) {
    x.total_file_access[extension] = parseInt(total);
  }

  return x as UsageProfile;
}
