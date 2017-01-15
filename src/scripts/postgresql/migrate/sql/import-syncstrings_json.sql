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
    to_timestamp((a#>>'{last_active,1,epoch_time}')::FLOAT),
    to_timestamp((a#>>'{last_file_change,1,epoch_time}')::FLOAT),
    (a#>>'{path}')::VARCHAR,
    (a#>>'{deleted}')::BOOL,
    (a#>'{init}'),
    (a#>'{save}'),
    (a#>>'{read_only}')::BOOL,
    jsonb_array_to_text_array(a#>'{users}')::UUID[],
    to_timestamp((a#>>'{last_snapshot,1,epoch_time}')::FLOAT),
    (a#>>'{snapshot_interval}')::INTEGER,
    (a#>>'{archived}')::UUID
  FROM syncstrings_json
);


