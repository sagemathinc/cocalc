/*
User management of the v1 API key associated to an account.
This supports three actions:

- get: get the existing key associated to an account; return undefined if there is no api key set.
- delete: delete the existing key associated to an account
- regenerate: delete the existing key and replace it by a new random key.

If the user has a password, then it must be provided and be correct. If they have no password,
then the provided one is ignored.
*/

import getPool from "@cocalc/database/pool";
import { isValidUUID } from "@cocalc/util/misc";
import isPasswordCorrect from "@cocalc/server/auth/is-password-correct";
import hasPassword from "@cocalc/server/auth/has-password";
import { generate } from "random-key";

interface Options {
  account_id: string;
  password?: string;
  action: "get" | "delete" | "regenerate";
}

export default async function manage({
  account_id,
  password,
  action,
}: Options): Promise<string | undefined> {
  if (!isValidUUID) {
    throw Error("account_id is not a valid uuid");
  }

  // Check if the user has a password
  if (await hasPassword(account_id)) {
    if(!password) {
      throw Error("password must be provided");
    }
    // verify password is correct
    if (!(await isPasswordCorrect({ account_id, password }))) {
      throw Error("invalid password");
    }
  }
  // Now we allow the action.
  const pool = getPool();
  switch (action) {
    case "get":
      const { rows } = await pool.query(
        "SELECT api_key FROM accounts WHERE account_id=$1::UUID",
        [account_id]
      );
      if (rows.length == 0) {
        throw Error("no such account");
      }
      return rows[0].api_key;
    case "delete":
      await pool.query(
        "UPDATE accounts SET api_key=NULL WHERE account_id=$1::UUID",
        [account_id]
      );
      return;
    case "regenerate":
      // There is a unique index on api_key, so there is a small probability
      // that this query fails.  However, it's probably smaller than the probability
      // that the database connection is broken, so if it were to ever happen, then
      // the user could just retry.  For context, for the last few years, this query
      // happened on cocalc.com only a few thousand times *total*.
      const api_key = `sk_${generate()}`;
      await pool.query(
        "UPDATE accounts SET api_key=$1 WHERE account_id=$2::UUID",
        [api_key, account_id]
      );
      return api_key;
    default:
      throw Error(`unknown action="${action}"`);
  }
}

/* Get the account that has the given api key, or returns undefined if there
is no such account. */
export async function getAccountWithApiKey(
  api_key: string
): Promise<string | undefined> {
  const pool = getPool("medium");
  const { rows } = await pool.query(
    "SELECT account_id FROM accounts WHERE api_key = $1::TEXT",
    [api_key]
  );
  return rows[0]?.account_id;
}
