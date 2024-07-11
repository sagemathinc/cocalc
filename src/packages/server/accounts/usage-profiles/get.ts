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
import { midnightUtcPreviousDay } from "./util";

// Get most recent usage profile, which is the one at "round down to midnight UTC"
// of the previous day.
export const getMostRecentUsageProfile = reuseInFlight(
  async ({ account_id }: { account_id: string }): Promise<UsageProfile> => {
    const pool = getPool();
    const { rows } = await pool.query(
      SQL`SELECT * FROM usage_profiles WHERE account_id=${account_id} AND time > NOW() - INTERVAL '2 day'`,
    );
    if (rows.length > 0) {
      return rows[0] as UsageProfile;
    }
    const usageProfile = await computeMostRecentUsageProfile(account_id);
    await pool.query(
      SQL`INSERT INTO usage_profiles(
      account_id, time, total_purchases, total_file_access)
      VALUES(${usageProfile.account_id}, ${usageProfile.time},
             ${usageProfile.total_purchases}, ${usageProfile.total_file_access})`,
    );
    return usageProfile;
  },
);

// Dumbest first implementation.
// We'll have a much more efficient one that uses that last known usage profile
// and fills in them from then until now, etc. But this is a good consistency check.
export async function computeMostRecentUsageProfile(account_id: string) {
  const pool = getPool();
  // this is at least 24 hours ago.
  const time = midnightUtcPreviousDay();
  const x = { time, account_id } as Partial<UsageProfile>;

  // get purchases grouped by service, but ONLY those purchases that are actually on
  // some daily statement, so that they are definitely done.  We also use the statement's
  // time for the cutoff, not the purchase time.  It can be ~3 days from the purchase time
  // until the purchase is on a statement.  Since time is at least 24 hours ago, if there
  // are any daily statement for the user up to time, they are done, and there will never be
  // more added.
  const credit = await pool.query(
    SQL`SELECT SUM(purchases.cost) AS total, purchases.service FROM purchases,statements WHERE
    purchases.account_id=${account_id} AND
    purchases.day_statement_id=statements.id
    AND statements.time <= ${time} GROUP BY purchases.service`,
  );
  x.total_purchases = {};
  for (const { service, total } of credit.rows) {
    x.total_purchases[service] = total;
  }

  // Get how *much* they used each type of file.
  // NOTE: this skips empty filename extension
  const file_access = await pool.query(
    "SELECT COUNT(*) AS total, substring(filename FROM '.([^.]*$)') AS extension FROM file_access_log WHERE account_id=$1 AND position('.' in filename) > 1 GROUP BY extension ORDER BY total DESC",
    [account_id],
  );
  x.total_file_access = {};
  for (const { extension, total } of file_access.rows) {
    x.total_file_access[extension] = parseInt(total);
  }

  return x as UsageProfile;
}
