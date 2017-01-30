INSERT INTO storage_servers (
  SELECT
    a#>>'{host}'
  FROM storage_servers_json
) ON CONFLICT(host) DO NOTHING;
