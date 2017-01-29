/*
time psql -d migrate -a -f import-password_reset_attempts_json.sql

Copies data from RethinkDB JSON to the password_reset_attempts table.
*/

INSERT INTO password_reset_attempts (
  SELECT
    (a#>>'{id}')::UUID,
    (a#>>'{email_address}'),
    (a#>>'{ip_address}')::INET,
    to_timestamp((a#>>'{time,epoch_time}')::FLOAT)
  FROM password_reset_attempts_json
) ON CONFLICT (id) DO UPDATE SET id=EXCLUDED.id;
