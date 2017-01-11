/*
psql -d migrate -a -f import-accounts_json.sql

Copies data from RethinkDB JSON to the proper accounts table.
*/

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

INSERT INTO accounts (
  SELECT
    (a#>>'{account_id}')::UUID,
    to_timestamp((a#>>'{created,epoch_time}')::FLOAT),
    (a#>>'{created_by}')::INET,
    (a#>>'{creation_actions_done}')::BOOL,
    (a#>>'{password_hash}'),
    NULL,    /* there is no deleted field in the old db */
    (a#>>'{email_address}'),
    (a#>>'{email_address_before_delete}'),
    (a#>'{passports}'),
    (a#>'{editor_settings}'),
    (a#>'{other_settings}'),
    left(a#>>'{first_name}', 254),
    left(a#>>'{last_name}', 254),
    (a#>>'{banned}')::BOOL,
    (a#>'{terminal}'),
    (a#>>'{autosave}')::INTEGER,
    (a#>>'{evaluate_key}'),
    (a#>>'{font_size}')::INTEGER,
    to_timestamp((a#>>'{last_active,epoch_time}')::FLOAT),
    (a#>>'{stripe_customer_id}'),
    (a#>'{stripe_customer}'),
    (a#>'{profile}'),
    jsonb_array_to_text_array(a#>'{groups}')
    FROM accounts_json
) ON CONFLICT (account_id) DO UPDATE SET creation_actions_done=EXCLUDED.creation_actions_done, password_hash=EXCLUDED.password_hash, deleted=EXCLUDED.deleted, email_address=EXCLUDED.email_address, email_address_before_delete=EXCLUDED.email_address_before_delete, passports=EXCLUDED.passports, editor_settings=EXCLUDED.editor_settings, other_settings=EXCLUDED.other_settings, first_name=EXCLUDED.first_name, last_name=EXCLUDED.last_name, banned=EXCLUDED.banned, terminal=EXCLUDED.terminal, autosave=EXCLUDED.autosave, evaluate_key=EXCLUDED.evaluate_key, font_size=EXCLUDED.font_size, last_active=EXCLUDED.last_active, stripe_customer_id=EXCLUDED.stripe_customer_id, stripe_customer=EXCLUDED.stripe_customer, profile=EXCLUDED.profile, groups=EXCLUDED.groups;


UPDATE accounts SET deleted=true WHERE email_address_before_delete IS NOT NULL;

DROP TABLE accounts_json;

