/*
Return the minimum allowed balance for a user.  This defaults to 0. 
If set to be negative, this gives the user a "credit limit", i.e., if
it is 100, then they can spend up to $100 via pay-as-you-go, etc.,
before having to pay us.

Our intention for now is that the default is 0, but users can make a support 
request to set their limit to be lower. We may change things so the default
is lower than 0 for some users, as defined by a database setting... but that's
pretty frightening.

NOTE: result of this query is aggressively cached via "long", since
it rarely changes -- only when an admin manually changes something.
*/

import getPool, { PoolClient, Pool } from "@cocalc/database/pool";
import { toDecimal } from "@cocalc/util/money";

export default async function getMinBalance(
  account_id: string,
  client?: PoolClient | Pool
): Promise<number> {
  const pool = client ?? getPool("long");
  const { rows } = await pool.query(
    "SELECT min_balance FROM accounts WHERE account_id=$1",
    [account_id]
  );
  return toDecimal(rows[0]?.min_balance ?? 0).toNumber(); // defaults to 0
}
