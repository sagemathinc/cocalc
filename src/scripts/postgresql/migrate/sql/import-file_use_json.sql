/*
time psql -d migrate -a -f import-file_use_json.sql

Copies data from RethinkDB JSON to the file_use table.
*/

INSERT INTO file_use (
  SELECT
    (a#>>'{id}'),
    (a#>>'{project_id}')::UUID,
    (a#>>'{path}'),
    (a#>'{users}'),
    to_timestamp((a#>>'{last_edited,epoch_time}')::FLOAT)
  FROM file_use_json
) ON CONFLICT (id) DO UPDATE SET id=EXCLUDED.id;
