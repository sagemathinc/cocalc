CREATE OR REPLACE FUNCTION jsonb_array_to_text_array(
  p_input jsonb
) RETURNS TEXT[] AS $BODY$

DECLARE v_output text[];

BEGIN

  SELECT array_agg(ary)::text[]
  INTO v_output
  FROM jsonb_array_elements_text(p_input) AS ary;

  RETURN v_output;

END;

$BODY$
LANGUAGE plpgsql VOLATILE;

INSERT INTO syncstrings (
  SELECT
    (a#>>'{string_id}')::CHAR(40),
    (a#>>'{project_id}')::UUID,
    to_timestamp((a#>>'{last_active,epoch_time}')::FLOAT),
    to_timestamp((a#>>'{last_file_change,epoch_time}')::FLOAT),
    (a#>>'{path}')::VARCHAR,
    (a#>>'{deleted}')::BOOL,
    json_build_object('time', to_timestamp((a#>>'{init,time,epoch_time}')::FLOAT), 'error', a#>>'{init,error}'),
    (a#>'{save}'),
    (a#>>'{read_only}')::BOOL,
    jsonb_array_to_text_array(a#>'{users}')::UUID[],
    to_timestamp((a#>>'{last_snapshot,epoch_time}')::FLOAT),
    (a#>>'{snapshot_interval}')::INTEGER,
    (a#>>'{archived}')::UUID
  FROM syncstrings_json
) ON CONFLICT(string_id) DO UPDATE SET project_id=EXCLUDED.project_id, last_active=EXCLUDED.last_active, last_file_change=EXCLUDED.last_file_change, path=EXCLUDED.path, deleted=EXCLUDED.deleted, init=EXCLUDED.init, save=EXCLUDED.save, read_only=EXCLUDED.read_only, users=EXCLUDED.users, last_snapshot=EXCLUDED.last_snapshot, snapshot_interval=EXCLUDED.snapshot_interval, archived=EXCLUDED.archived;





