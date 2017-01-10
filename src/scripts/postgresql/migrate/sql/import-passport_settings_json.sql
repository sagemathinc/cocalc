/*
time psql -d migrate -a -f import-passport_settings_json.sql

Copies data from RethinkDB JSON to the passport_settings table.
*/

INSERT INTO passport_settings (
  SELECT
    a#>>'{strategy}',
    a#>'{conf}'
  FROM passport_settings_json
) ON CONFLICT (strategy) DO UPDATE SET strategy=EXCLUDED.strategy;
