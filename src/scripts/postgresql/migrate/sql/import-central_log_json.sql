/*
time psql -d migrate -a -f import-central_log_json.sql

Copies data from RethinkDB JSON to the central_log table.
*/

INSERT INTO central_log (
  SELECT
    (a#>>'{id}')::UUID,
    (a#>>'{event}'),
    (a#>'{value}'),
    to_timestamp((a#>>'{time,epoch_time}')::FLOAT)
  FROM central_log_json 
) ON CONFLICT (id) DO NOTHING;
