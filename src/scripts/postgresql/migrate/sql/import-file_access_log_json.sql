/*
time psql -d migrate -a -f import-file_access_log_json.sql

Copies data from RethinkDB JSON to the file_access_log table.
*/

INSERT INTO file_access_log (
  SELECT
    (a#>>'{id}')::UUID,
    (a#>>'{project_id}')::UUID,
    (a#>>'{account_id}')::UUID,
    (a#>>'{filename}'),
    to_timestamp((a#>>'{time,epoch_time}')::FLOAT)
  FROM file_access_log_json
) ON CONFLICT (id) DO UPDATE SET id=EXCLUDED.id;
