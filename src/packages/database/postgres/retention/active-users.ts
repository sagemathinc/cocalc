import getLogger from "@cocalc/backend/logger";
const log = getLogger("database:retention:active-users");

export default async function activeUsers({
  model,
  table,
  last_start_time,
  pool,
  start,
  stop,
  period,
}) {
  const query = `WITH
periods0 AS (
  SELECT $1::timestamp + (n * $2::interval) AS period_start,
         $1::timestamp + ((n + 1) * $2::interval) AS period_end
  FROM generate_series(0, floor(EXTRACT(EPOCH FROM (now() - $1::timestamp - '1 second'::interval)) / EXTRACT(EPOCH FROM $2::interval))::integer) AS n
  ),
periods AS (SELECT * FROM periods0 ${
    last_start_time == null ? "" : "WHERE period_start > $3"
  }),
period_counts AS (
  SELECT periods.period_start, COUNT(DISTINCT ${table}.account_id) AS count
  FROM periods
  LEFT JOIN ${table} ON ${table}.time >= periods.period_start AND ${table}.time < periods.period_end
  GROUP BY periods.period_start
)
SELECT periods.period_start, periods.period_end, COALESCE(period_counts.count, 0) AS count
FROM periods
LEFT JOIN period_counts ON periods.period_start = period_counts.period_start
WHERE periods.period_end <= NOW()
ORDER BY periods.period_start`;

  const getSize = async (rows) => {
    if (rows.length == 0) return 0;
    return (
      await pool.query(
        `SELECT COUNT(DISTINCT(account_id)) as size FROM ${table} WHERE time >= $1::timestamp AND time < $2::timestamp`,
        [start, rows[rows.length - 1].period_end]
      )
    ).rows[0].size;
  };

  if (last_start_time == null) {
    log.debug("just compute all the data");
    const { rows } = await pool.query(query, [start, period]);
    if (rows.length == 0) {
      // shouldn't happen because should get excluded above...
      return;
    }
    const active = rows.map((x) => parseInt(x.count));
    const last_start_time = rows[rows.length - 1].period_start;
    await pool.query(
      "INSERT INTO crm_retention(start,stop,model,period,active,last_start_time,size) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [start, stop, model, period, active, last_start_time, await getSize(rows)]
    );
  } else {
    log.debug("compute the missing data and put it into the database");
    const { rows } = await pool.query(query, [start, period, last_start_time]);
    if (rows.length == 0) {
      // shouldn't happen because should get excluded...
      return;
    }
    const active = rows.map((x) => parseInt(x.count));
    const new_last_start_time = rows[rows.length - 1].period_start;
    await pool.query(
      "UPDATE crm_retention SET last_start_time=$5::timestamp, active = array_cat(active, $6::integer[]) WHERE start=$1 AND stop=$2 AND model=$3 AND period=$4 AND size=$7",
      [
        start,
        stop,
        model,
        period,
        new_last_start_time,
        active,
        await getSize(rows),
      ]
    );
  }
}

/*
WITH
periods AS (
  SELECT '2023-04-03'::timestamp + (n * '1 day'::interval) AS period_start,
         '2023-04-03'::timestamp + ((n + 1) * '1 day'::interval) AS period_end
  FROM generate_series(0, floor(EXTRACT(EPOCH FROM (now() - '2023-04-03'::timestamp - '1 second'::interval)) / EXTRACT(EPOCH FROM '1 day'::interval))::integer) AS n
  ),
period_counts AS (
  SELECT periods.period_start, COUNT(DISTINCT file_access_log.account_id) AS count
  FROM periods
  LEFT JOIN file_access_log ON file_access_log.time >= periods.period_start AND file_access_log.time < periods.period_end
  GROUP BY periods.period_start
)
SELECT periods.period_start, periods.period_end, COALESCE(period_counts.count, 0) AS count
FROM periods
LEFT JOIN period_counts ON periods.period_start = period_counts.period_start
WHERE periods.period_end <= NOW()
ORDER BY periods.period_start;

*/
