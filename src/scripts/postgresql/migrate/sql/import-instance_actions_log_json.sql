/*
time psql -d migrate -a -f import-instance_actions_log_json.sql

Copies data from RethinkDB JSON to the instance_actions_log table.
*/

INSERT INTO instance_actions_log (
  SELECT
    (a#>>'{id}')::UUID,
    a#>>'{name}',
    json_build_object('type', a#>>'{action,type}', 'action', a#>>'{action,type}', 'started', to_timestamp((a#>>'{action,started,epoch_time}')::FLOAT), 'finished', to_timestamp((a#>>'{action,finished,epoch_time}')::FLOAT))
  FROM instance_actions_log_json
) ON CONFLICT (id) DO UPDATE SET id=EXCLUDED.id;
