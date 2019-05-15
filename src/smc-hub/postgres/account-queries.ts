/* Various functions involving the database and accounts. */

import { PostgreSQL } from "./types";

import { callback2 } from "../smc-util/async-utils";

/* For now we define "paying customer" to mean they have a subscription.
  It's OK if it expired.  They at least bought one once.
  This is mainly used for anti-abuse purposes...
*/
export async function is_paying_customer(
  db: PostgreSQL,
  account_id: string
): Promise<boolean> {
  let x;
  try {
    x = await callback2(db.get_account, {
      account_id,
      columns: ["stripe_customer"]
    });
  } catch (err) {
    // error probably means there is no such project or project_id is badly formatted.
    return false;
  }
  if (x.stripe_customer == null || x.stripe_customer.subscriptions == null) {
    return false;
  }
  return  !!x.stripe_customer.subscriptions.total_count;
}
