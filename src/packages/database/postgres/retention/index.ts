import getPool from "../../pool";
import getLogger from "@cocalc/backend/logger";

const log = getLogger("database:retention");

type Period =
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
Obviously, chatgpt helped with writing this:

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
    log.debug(
      "have the data, so nothing to do",
      JSON.stringify(current.rows[0])
    );
    // nothing to do.
    return;
  }
  log.debug("need to compute data", JSON.stringify(current.rows?.[0]));

  if (model == "file_access_log") {
    if (current.rows.length == 0) {
      log.debug("just compute all the data");
      const query = `WITH
cohort AS (SELECT account_id FROM accounts WHERE created >= $1::timestamp AND created < $2::timestamp),
periods AS (
  SELECT $1::timestamp + (n * $3::interval) AS period_start,
         $1::timestamp + ((n + 1) * $3::interval) AS period_end
  FROM generate_series(0, floor(EXTRACT(EPOCH FROM (now() - $1::timestamp - '1 second'::interval)) / EXTRACT(EPOCH FROM $3::interval))::integer) AS n
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
ORDER BY periods.period_start`;
      const { rows } = await pool.query(query, [start, stop, period]);
      if (rows.length == 0) {
        // shouldn't happen because should get excluded above...
        return;
      }
      const active = rows.map((x) => parseInt(x.count));
      const last_start_time = rows[rows.length - 1].period_start;
      const size = (
        await pool.query(
          "SELECT count(*) as size FROM accounts WHERE created >= $1::timestamp AND created < $2::timestamp",
          [start, stop]
        )
      ).rows[0].size;
      await pool.query(
        "INSERT INTO crm_retention(start,stop,model,period,size,active,last_start_time) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [start, stop, model, period, size, active, last_start_time]
      );
    } else {
      log.debug("compute the missing data and put it into the database");
    }
  } else {
    throw Error(`unsupported model: ${model}`);
  }
}
