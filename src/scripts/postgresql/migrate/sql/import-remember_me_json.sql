INSERT INTO remember_me (
  SELECT
    (a#>>'{hash}')::CHAR(127),
    (a#>'{value}'),
    (a#>>'{account_id}')::UUID,
    to_timestamp((a#>>'{expire,1,epoch_time}')::FLOAT)
  FROM remember_me_json
);