-- This is for the old patches table, but can be handy for other tables.
-- run psql and the just copy/paste this.
-- Expected output (about 2 seconds per line ...)
--  NOTICE:  Deleted 10000 rows in 00:00:00.688278. Delay 1.376556
--  NOTICE:  Deleted 10000 rows in 00:00:00.589805. Delay 1.17961
--  NOTICE:  Deleted 10000 rows in 00:00:00.645825. Delay 1.29165
--  [...]

DO $$
DECLARE
  rows_deleted INTEGER;
  start_time TIMESTAMP;
  elapsed_time INTERVAL;
  delay DOUBLE PRECISION;
BEGIN
  LOOP
    -- Record start time
    start_time := clock_timestamp();

    -- Perform the deletion
    DELETE FROM patches WHERE time <= (SELECT time FROM patches ORDER BY time ASC LIMIT 1 OFFSET 9999);

    -- Get number of rows deleted
    GET DIAGNOSTICS rows_deleted = ROW_COUNT;

    -- Calculate elapsed time
    elapsed_time := clock_timestamp() - start_time;

    -- Exit loop if no rows were deleted
    EXIT WHEN rows_deleted = 0;

    -- Commit the transaction
    COMMIT;

    delay := 2 * EXTRACT(EPOCH FROM elapsed_time);

    RAISE NOTICE 'Deleted % rows in %. Delay %', rows_deleted, elapsed_time, delay;

    -- Wait for twice the elapsed time (in seconds)
    PERFORM pg_sleep(delay);
  END LOOP;
END $$;

