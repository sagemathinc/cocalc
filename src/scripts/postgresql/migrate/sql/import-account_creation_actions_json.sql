/*
psql -d migrate -a -f import-account_creation_actions_json.sql

Copies data from RethinkDB JSON to the account_creation_actions table.
*/

INSERT INTO account_creation_actions (
  SELECT
    (a#>>'{id}')::UUID,
    (a#>'{action}'),
    (a#>>'{email_address}'),
    to_timestamp((a#>>'{expire,epoch_time}')::FLOAT)
  FROM account_creation_actions_json
) ON CONFLICT (id) DO UPDATE SET id=EXCLUDED.id;
