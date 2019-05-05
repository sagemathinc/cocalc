/* Adding (and later removing) collaborators to/from projects. */

import { PostgreSQL } from "./types";

import { is_valid_uuid_string } from "../smc-util/misc2";

import { callback2 } from "../smc-util/async-utils";

export async function record_user_tracking(
  db: PostgreSQL,
  account_id: string,
  event: string,
  value: { [key: string]: any }
): Promise<void> {
  /* Right now this function is called from outside typescript
    (e.g., api from user), so we have to do extra type checking.
    Also, the input is uuid's, which typescript can't check. */
  if (!is_valid_uuid_string(account_id)) {
    throw Error("invalid account_id");
  }
  if (event == null || event.length == 0) {
    throw Error("evt must be specified");
  }
  if (event.length > 80) {
    throw Error("event must have length at most 80");
  }
  if (value == null) {
    throw Error("value must be specified");
  }

  await callback2(db._query, {
    query: "INSERT INTO user_tracking",
    values: {
      "account_id :: UUID": account_id,
      "time       :: TIMESTAMP": "NOW()",
      "event      :: TEXT": event,
      "value      :: JSONB": value
    }
  });
}
