/*
We do two inserts, since we deprecated the stats format about half way through.
After this all data will be in the new format (yeah!).

There are 25 stupid old entries with no time, so we exclude those...

NOTE that we ignore the hub_servers field below, because it uses a lot of space,
is hard to translate, and has no real value.
*/



INSERT INTO stats (
  SELECT
    (a#>>'{id}')::UUID,
    to_timestamp((a#>>'{time,epoch_time}')::FLOAT),
    (a#>>'{accounts}')::INTEGER,
    a#>'{accounts_created}',
    (a#>>'{projects}')::INTEGER,
    a#>'{projects_created}',
    a#>'{projects_edited}'
  FROM stats_json where a#>>'{active_projects}' IS NULL  and a#>>'{time}' IS NOT NULL
) ON CONFLICT(id) DO NOTHING;

/*

Deprecated data

        active_projects     : true # deprecated → projects_edited[RECENT_TIMES-key]
        last_hour_projects  : true # deprecated → projects_edited[RECENT_TIMES-key]
        last_day_projects   : true # deprecated → projects_edited[RECENT_TIMES-key]
        last_week_projects  : true # deprecated → projects_edited[RECENT_TIMES-key]
        last_month_projects : true # deprecated → projects_edited[RECENT_TIMES-key]

where, projects_edited looks like
    {"1d": 1295, "1h": 199, "7d": 6489, "30d": 27462, "5min": 54}

*/

INSERT INTO stats (
  SELECT
    (a#>>'{id}')::UUID,
    to_timestamp((a#>>'{time,epoch_time}')::FLOAT),
    (a#>>'{accounts}')::INTEGER,
    a#>'{accounts_created}',
    (a#>>'{projects}')::INTEGER,
    a#>'{projects_created}',
    json_build_object('5min', (a#>>'{active_projects}')::INTEGER, '1h', (a#>>'{last_hour_projects}')::INTEGER, '1d', (a#>>'{last_day_projects}')::INTEGER, '7d', (a#>>'{last_week_projects}')::INTEGER, '30d', (a#>>'{last_month_projects}')::INTEGER)
  FROM stats_json where a#>>'{active_projects}' IS NOT NULL and a#>>'{time}' IS NOT NULL
) ON CONFLICT(id) DO NOTHING;

