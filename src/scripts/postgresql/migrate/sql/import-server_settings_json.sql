INSERT INTO server_settings (
  SELECT
    (a#>>'{name}')::VARCHAR,
    (a#>>'{value}')::VARCHAR
  FROM server_settings_json
);