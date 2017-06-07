INSERT INTO system_notifications (
  SELECT
    (a#>>'{id}')::UUID,
    to_timestamp((a#>>'{time,epoch_time}')::FLOAT),
    a#>>'{text}',
    a#>>'{priority}',
    (a#>>'{done}')::BOOL
  FROM system_notifications_json
) ON CONFLICT(id) DO UPDATE SET time=EXCLUDED.time, text=EXCLUDED.text, priority=EXCLUDED.priority, done=EXCLUDED.done;
