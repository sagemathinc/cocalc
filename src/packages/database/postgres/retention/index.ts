import getPool from "../../pool";
import getLogger from "@cocalc/backend/logger";
import fileAccessLog from "./file-access-log";

const log = getLogger("database:retention");

type Period =
  | { seconds: number }
  | { hours: number }
  | { days: number }
  | { months: number }
  | { years: number };

interface Options {
  start: Date;
  stop: Date;
  model: string;
  period: Period;
}

/*
This is particularly complicated and we use the period_counts CTE because we want to include 0's even when
there are no matches on a given day, so we can just take the counts exactly and put them in the database.
The actual query below that we really use is even more complicated because it also has to deal with
both doing the original query and updating it as time progresses.

WITH
cohort AS (SELECT account_id FROM accounts WHERE created >= '2023-04-03'::timestamp AND created < '2023-04-03'::timestamp + interval '1 day'),
periods AS (
  SELECT '2023-04-03'::timestamp + (n * '1 day'::interval) AS period_start,
         '2023-04-03'::timestamp + ((n + 1) * '1 day'::interval) AS period_end
  FROM generate_series(0, floor(EXTRACT(EPOCH FROM (now() - '2023-04-03'::timestamp - '1 second'::interval)) / EXTRACT(EPOCH FROM '1 day'::interval))::integer) AS n
  ),
period_counts AS (
  SELECT periods.period_start, COUNT(DISTINCT file_access_log.account_id) AS count
  FROM periods
  LEFT JOIN file_access_log ON file_access_log.time >= periods.period_start AND file_access_log.time < periods.period_end
  JOIN cohort ON file_access_log.account_id = cohort.account_id
  GROUP BY periods.period_start
)
SELECT periods.period_start, periods.period_end, COALESCE(period_counts.count, 0) AS count
FROM periods
LEFT JOIN period_counts ON periods.period_start = period_counts.period_start
WHERE periods.period_end <= NOW()
ORDER BY periods.period_start;

*/

export async function updateRetentionData({
  start,
  stop,
  model,
  period,
}: Options) {
  if (start == null || stop == null || model == null || period == null) {
    log.debug("some input is null so nothing to do");
    // nothing to do
    return;
  }
  if (typeof start == "object" && start["="]) {
    start = start["="];
  }
  if (typeof stop == "object" && stop["="]) {
    stop = stop["="];
  }
  if (typeof model == "object" && model["="]) {
    model = model["="];
  }
  if (typeof period == "object" && period["="]) {
    period = period["="];
  }
  const pool = getPool();
  const current = await pool.query(
    "SELECT last_start_time, NOW() - $4::interval - $4::interval AS required_last_start_time FROM crm_retention WHERE start=$1 AND stop=$2 AND model=$3 AND period=$4",
    [start, stop, model, period]
  );
  log.debug(current);

  if (
    current.rows.length > 0 &&
    current.rows[0].last_start_time >= current.rows[0].required_last_start_time
  ) {
    log.debug("have the data, so nothing to do");
    // nothing to do.
    return;
  }
  log.debug("need to compute data", JSON.stringify(current.rows?.[0]));

  // We do a check to make sure the interval is not too short to avoid a massive
  // computation.  This could easily happen, e.g., when playing around in the crm.
  const { rows } = await pool.query(
    "SELECT extract(epoch FROM $1::interval) AS seconds",
    [period]
  );
  if (rows[0].seconds < 3600) {
    throw Error("period must be at least one hour long");
    // TODO: stronger constraint involving start?
  }
  const last_start_time = current.rows[0]?.last_start_time;

  if (model == "file_access_log") {
    await fileAccessLog({ last_start_time, pool, start, stop, period });
  } else {
    throw Error(`unsupported model: ${model}`);
  }
}
