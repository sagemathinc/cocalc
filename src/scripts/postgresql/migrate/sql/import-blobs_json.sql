/*
time psql -d migrate -a -f blobs.sql

Copies data from RethinkDB JSON to the blobs table.

NOTE: a tiny fraction of ids were 40 characters
*/

INSERT INTO blobs
  (SELECT
    (a#>>'{id}')::UUID,
    NULL,
    to_timestamp((a#>>'{expire,epoch_time}')::FLOAT),
    to_timestamp((a#>>'{created,epoch_time}')::FLOAT),
    (a#>>'{project_id}')::UUID,
    to_timestamp((a#>>'{last_active,epoch_time}')::FLOAT),
    (a#>>'{count}')::INTEGER,
    (a#>>'{size}')::INTEGER,
    (a#>>'{gcloud}'),
    (a#>>'{backup}')::BOOL
  FROM blobs_json WHERE CHAR_LENGTH(a#>>'{id}') = 36
) ON CONFLICT(id) DO UPDATE SET blob=EXCLUDED.blob, expire=EXCLUDED.expire, last_active=EXCLUDED.last_active, count=EXCLUDED.count, gcloud=EXCLUDED.gcloud, backup=EXCLUDED.backup;