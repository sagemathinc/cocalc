/*
time psql -d migrate -a -f import-compute_servers_json.sql

NOTE:  We leave of the status field, since it would be stale within
minutes, and will get regenerated, and also it's a pain to fix the
timestamp field in the JSON.
*/


INSERT INTO compute_servers (
  SELECT
    a#>>'{host}',
    a#>>'{dc}',
    (a#>>'{port}')::integer,
    a#>>'{secret}',
    (a#>>'{experimental}')::BOOL,
    (a#>>'{member_host}')::BOOL
  FROM compute_servers_json
) ON CONFLICT (host) DO UPDATE SET host=EXCLUDED.host;
