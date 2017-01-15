INSERT INTO public_paths (
  SELECT
    (a#>>'{id}')::CHAR(40),
    (a#>>'{project_id}')::UUID,
    (a#>>'{path}')::VARCHAR,
    (a#>>'{description}')::VARCHAR,
    (a#>>'{disabled}')::BOOL
  FROM public_paths_json
);