/*
time psql -d migrate -a -f blobs.sql

Copies data from RethinkDB JSON to the blobs table.

NOTE: a tiny fraction of ids were 40 characters

We only copy over blobs that have been updated to google cloud storage!!!
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
    (a#>>'{backup}')::BOOL,
    (a#>>'{compress}')::VARCHAR
  FROM blobs_json WHERE CHAR_LENGTH(a#>>'{id}') = 36 AND (a#>>'{gcloud}') IS NOT NULL
) ON CONFLICT(id) DO UPDATE SET blob=EXCLUDED.blob, expire=EXCLUDED.expire, created=EXCLUDED.created, project_id=EXCLUDED.project_id, last_active=EXCLUDED.last_active, count=EXCLUDED.count, size=EXCLUDED.size, gcloud=EXCLUDED.gcloud, backup=EXCLUDED.backup, compress=EXCLUDED.compress;
