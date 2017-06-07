/*
time psql -d migrate -a -f import-client_error_log_json.sql

Copies data from RethinkDB JSON to the client_error_log table.
*/

INSERT INTO client_error_log (
  SELECT
    (a#>>'{id}')::UUID,
    (a#>>'{event}'),
    (a#>>'{error}'),
    (a#>>'{account_id}')::UUID,
    to_timestamp((a#>>'{time,epoch_time}')::FLOAT)
  FROM client_error_log_json
) ON CONFLICT (id) DO NOTHING;
