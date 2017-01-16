

INSERT INTO projects (
  SELECT
    (a#>>'{project_id}')::UUID,
    (a#>>'{title}'),
    (a#>>'{description}'),
    (a#>'{users}'),
    (a#>'{invite}'),
    (a#>'{invite_requests}'),
    (a#>>'{deleted}')::BOOL,
    (a#>'{host}'),
    (a#>'{settings}'),
    (a#>'{status}'),
    (a#>'{state}'),
    to_timestamp((a#>>'{last_edited,epoch_time}')::FLOAT),
    (a#>'{last_active}'),
    to_timestamp((a#>>'{created,epoch_time}')::FLOAT),
    (a#>'{action_request}'),
    (a#>'{storage}'),
    to_timestamp((a#>>'{last_backup,epoch_time}')::FLOAT),
    (a#>'{storage_request}'),
    (a#>'{course}'),
    (a#>>'{run}')::BOOL,
    (a#>>'{storage_server}')::INTEGER,
    (a#>>'{storage_ready}')::BOOL,
    (a#>>'{disk_size}')::INTEGER,
    (a#>'{resources}'),
    (a#>>'{preemptible}')::BOOL,
    (a#>>'{idle_timeout}')::INTEGER
  FROM projects_json
);
