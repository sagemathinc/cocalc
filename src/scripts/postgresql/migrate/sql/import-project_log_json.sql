


INSERT INTO project_log (
  SELECT
    (a#>>'{id}')::UUID,
    (a#>>'{project_id}')::UUID,
    to_timestamp((a#>>'{time,epoch_time}')::FLOAT),
    (a#>>'{account_id}')::UUID,
    (a#>'{event}')
  FROM project_log_json
) ON CONFLICT (id) DO NOTHING;
