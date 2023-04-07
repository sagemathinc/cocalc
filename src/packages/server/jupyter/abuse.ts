import getPool from "@cocalc/database/pool";
import { isValidUUID } from "@cocalc/util/misc";

/*
We initially just implement some very simple rate limitations to prevent very
blatant abuse.
*/

const QUOTAS = {
  noAccount: 10 ** 4,
  account: 10 ** 5,
  global: 10 ** 6,
};

/* for testing
const QUOTAS = {
  noAccount: 300,
  account: 1000,
  global: 3000,
};
*/

// Throws an exception if the request should not be allowed.
export default async function checkForAbuse({
  account_id,
  analytics_cookie,
}: {
  account_id?: string;
  analytics_cookie?: string;
}): Promise<void> {
  if (!isValidUUID(account_id) && !isValidUUID(analytics_cookie)) {
    // at least some amount of tracking.
    throw Error("at least one of account_id or analytics_cookie must be set");
  }

  const usage = await recentUsage({
    cache: "short",
    period: "1 hour",
    account_id,
    analytics_cookie,
  });
  // console.log("usage = ", usage);
  if (account_id) {
    if (usage > QUOTAS.account) {
      throw Error(
        `You may use at most ${QUOTAS.account} tokens per hour. Please try again later.`
      );
    }
  } else if (usage > QUOTAS.noAccount) {
    throw Error(
      `You may use at most ${QUOTAS.noAccount} tokens per hour. Sign in to increase your quota.`
    );
  }

  // Prevent more sophisticated abuse, e.g., changing analytics_cookie or account frequently,
  // or just a general huge surge in usage.
  const overallUsage = await recentUsage({ cache: "long", period: "1 hour" });
  // console.log("overallUsage = ", usage);
  if (overallUsage > QUOTAS.global) {
    throw Error(
      `There is too much usage of ChatGPT right now.  Please try again later.`
    );
  }
}

async function recentUsage({
  period,
  account_id,
  analytics_cookie,
  cache,
}: {
  period: string;
  account_id?: string;
  analytics_cookie?: string;
  // some caching so if user is hitting us a lot, we don't hit the database to
  // decide they are abusive -- at the same time, short enough that we notice.
  // Recommendation: "short"
  cache?: "short" | "medium" | "long";
}): Promise<number> {
  let query, args;
  if (account_id) {
    query = `SELECT SUM(total_time_s) AS usage FROM jupyter_execute_log WHERE account_id=$1 AND time >= NOW() - INTERVAL '${period}'`;
    args = [account_id];
  } else if (analytics_cookie) {
    query = `SELECT SUM(total_time_s) AS usage FROM jupyter_execute_log WHERE analytics_cookie=$1 AND time >= NOW() - INTERVAL '${period}'`;
    args = [analytics_cookie];
  } else {
    query = `SELECT SUM(total_time_s) AS usage FROM jupyter_execute_log WHERE time >= NOW() - INTERVAL '${period}'`;
    args = [];
  }
  const pool = getPool(cache);
  const { rows } = await pool.query(query, args);
  // console.log("rows = ", rows);
  return parseInt(rows[0]?.["usage"] ?? 0); // undefined = no results in above select,
}
