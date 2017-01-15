INSERT INTO stats (
  SELECT
    (a#>>'{name}')::VARCHAR,
    (a#>>'{value}')::VARCHAR
  FROM stats_json
);