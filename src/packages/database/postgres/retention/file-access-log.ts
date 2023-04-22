import getLogger from "@cocalc/backend/logger";
const log = getLogger("database:retention:file-access-log");

const MODEL = "file_access_log";

export default async function fileAccessLog({
  last_start_time,
  pool,
  start,
  stop,
  period,
}) {
  const query = `WITH
cohort AS (SELECT account_id FROM accounts WHERE created >= $1::timestamp AND created < $2::timestamp),
periods0 AS (
  SELECT $1::timestamp + (n * $3::interval) AS period_start,
         $1::timestamp + ((n + 1) * $3::interval) AS period_end
  FROM generate_series(0, floor(EXTRACT(EPOCH FROM (now() - $1::timestamp - '1 second'::interval)) / EXTRACT(EPOCH FROM $3::interval))::integer) AS n
  ),
periods AS (SELECT * FROM periods0 ${
    last_start_time == null ? "" : "WHERE period_start > $4"
  }),
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
  if (last_start_time == null) {
    log.debug("just compute all the data");
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
      [start, stop, MODEL, period, size, active, last_start_time]
    );
  } else {
    log.debug("compute the missing data and put it into the database");
    const { rows } = await pool.query(query, [
      start,
      stop,
      period,
      last_start_time,
    ]);
    if (rows.length == 0) {
      // shouldn't happen because should get excluded above...
      return;
    }
    const active = rows.map((x) => parseInt(x.count));
    const new_last_start_time = rows[rows.length - 1].period_start;
    await pool.query(
      "UPDATE crm_retention SET last_start_time=$5::timestamp, active = array_cat(active, $6::integer[]) WHERE start=$1 AND stop=$2 AND model=$3 AND period=$4",
      [start, stop, MODEL, period, new_last_start_time, active]
    );
  }
}
