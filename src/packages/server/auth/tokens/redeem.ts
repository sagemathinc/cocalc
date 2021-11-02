/* Redeem a registration token.

Raise an exception on failure with the error explaining the exception.

If no token is needed because of how site is configured,
then returns no matter what the input is.
*/

import getRequiresTokens from "./get-requires-token";
import getPool from "@cocalc/backend/database";

export default async function redeem(token: string): Promise<void> {
  const required = await getRequiresTokens();
  if (!required) {
    // no token required, so nothing to do.
    return;
  }

  if (!token) {
    throw Error("no registration token provided");
  }

  const client = getPool(); // no caching since the current count matters, etc.

  try {
    await client.query("BEGIN");

    // overview: first, we check if the token matches.
    // → check if it is disabled?
    // → check expiration date → abort if expired
    // → if counter, check counter vs. limit
    //   → true: increase the counter → ok
    //   → false: ok
    const q_match = `SELECT "expires", "counter", "limit", "disabled"
                     FROM registration_tokens
                     WHERE token = $1::TEXT
                     FOR UPDATE`;
    const match = await client.query(q_match, [token]);

    if (match.rows.length != 1) {
      throw Error("Registration token is wrong.");
    }
    // e.g. { expires: 2020-12-04T11:54:52.889Z, counter: null, limit: 10, disabled: ... }
    const {
      expires,
      counter: counter_raw,
      limit,
      disabled: disabled_raw,
    } = match.rows[0];
    const counter = counter_raw ?? 0;
    const disabled = disabled_raw ?? false;

    if (disabled) {
      throw Error("Registration token disabled.");
    }

    if (expires != null && expires.getTime() < new Date().getTime()) {
      throw Error("Registration token no longer valid.");
    }

    // we count in any case, but only enforce the limit if there is actually a limit set
    if (limit != null && limit <= counter) {
      throw Error("Registration token used up.");
    } else {
      // increase counter
      const q_inc = `UPDATE registration_tokens SET "counter" = coalesce("counter", 0) + 1
                     WHERE token = $1::TEXT`;
      await client.query(q_inc, [token]);
    }

    // all good, let's commit
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}
