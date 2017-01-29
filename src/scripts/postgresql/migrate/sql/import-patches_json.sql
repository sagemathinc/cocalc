
INSERT INTO patches (
  SELECT
    (a#>>'{id,0}')::CHAR(40),
    to_timestamp((a#>>'{id,1,epoch_time}')::FLOAT),
    (a#>>'{user}')::INTEGER,
    (a#>>'{patch}')::VARCHAR,
    (a#>>'{snapshot}')::VARCHAR,
    to_timestamp((a#>>'{sent,1,epoch_time}')::FLOAT),
    to_timestamp((a#>>'{prev,1,epoch_time}')::FLOAT)
  FROM patches_json WHERE a#>>'{id,1,epoch_time}' IS NOT NULL AND a#>>'{user}' IS NOT NULL
) ON CONFLICT(string_id, time) DO UPDATE SET patch=EXCLUDED.patch, snapshot=EXCLUDED.snapshot, sent=EXCLUDED.sent, prev=EXCLUDED.prev;


