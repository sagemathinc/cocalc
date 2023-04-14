/*
Return recent usage information about usage of the Jupyter API to carry
out non-cached computations.
*/

import getPool from "@cocalc/database/pool";

type QueryArgs = {
  period: string;
  account_id?: string;
  analytics_cookie?: string;
  cache?: "short" | "medium" | "long";
};

export default async function recentUsage({
  period,
  account_id,
  analytics_cookie,
  cache,
}: QueryArgs): Promise<number> {
  let queryArgs;

  if (account_id) {
    queryArgs = buildAccountIdQuery(period, account_id);
  } else if (analytics_cookie) {
    queryArgs = buildAnalyticsCookieQuery(period, analytics_cookie);
  } else {
    queryArgs = buildOverallUsageQuery(period);
  }

  return getUsageForQuery(queryArgs[0], queryArgs[1], cache);
}

async function getUsageForQuery(
  query: string,
  args: any[],
  cache?: QueryArgs["cache"]
): Promise<number> {
  const pool = getPool(cache);
  const { rows } = await pool.query(query, args);
  return parseInt(rows[0]?.["usage"] ?? 0);
}

function buildAccountIdQuery(
  period: string,
  account_id: string
): [string, any[]] {
  const query = `SELECT SUM(total_time_s) AS usage FROM jupyter_api_log WHERE created >= NOW() - INTERVAL '${period}' AND account_id=$1 AND project_id IS NULL AND path IS NULL`;
  const args = [account_id];
  return [query, args];
}

function buildAnalyticsCookieQuery(
  period: string,
  analytics_cookie: string
): [string, any[]] {
  const query = `SELECT SUM(total_time_s) AS usage FROM jupyter_api_log WHERE created >= NOW() - INTERVAL '${period}' AND analytics_cookie=$1 AND project_id IS NULL AND path IS NULL`;
  const args = [analytics_cookie];
  return [query, args];
}

function buildOverallUsageQuery(period: string): [string, any[]] {
  const query = `SELECT SUM(total_time_s) AS usage FROM jupyter_api_log WHERE created >= NOW() - INTERVAL '${period}' AND project_id IS NULL AND path IS NULL`;
  const args = [];
  return [query, args];
}
