import getPool from "@cocalc/database/pool";
import getLogger from "@cocalc/backend/logger";
const log = getLogger("db:stripe:customer-id");

// Set the stripe id in our database of this user.  If there is no user with this
// account_id, then this is a NO-OP (not an error).
export async function setStripeCustomerId(
  account_id: string,
  customer_id: string
): Promise<void> {
  log.debug("setting customer id of ", account_id, " to ", customer_id);
  const pool = getPool();
  await pool.query(
    "UPDATE accounts SET stripe_customer_id=$1::TEXT WHERE account_id=$2",
    [customer_id, account_id]
  );
}

// Get the stripe id in our database of this user (or undefined if no
// stripe_id or no such user).
export async function getStripeCustomerId(
  account_id: string
): Promise<string | undefined> {
  log.debug("getting customer id for ", account_id);
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT stripe_customer_id FROM accounts WHERE account_id=$1",
    [account_id]
  );
  return rows[0]?.stripe_customer_id;
}
