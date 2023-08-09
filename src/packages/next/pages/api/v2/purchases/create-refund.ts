/*
Refund a transaction.

This is ONLY allowed for admins to refund some or all of a credit that was
created by any users.  Users can't directly get refunds -- they must
go through support, in order to avoid abuse.

This API creates a refund object in stripe *and* creates a new transaction
(entry in our purchases table) for that refund, reducing the amount of the
customer's balance.  It's possible it could reduce a balance below 0, in which
case the customer would have to add significant money before making a purchase.

We may create another different admin API call for canceling/refunding internal
transactions, if that turns out to be necessary.

- purchase_id - id of some purchase in the purchases table, so a positive integer
- reason -  "duplicate", "fraudulent", "requested_by_customer" or "other" (same as in stripe)
- admount - positive floating point number in *dollars* (NOT cents like in stripe)
- notes - optional string; user DOES see this.
*/

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import createRefund from "@cocalc/server/purchases/create-refund";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in");
  }
  // This user MUST be an admin:
  if (!(await userIsInGroup(account_id, "admin"))) {
    throw Error("only admins can create refunds");
  }

  const { purchase_id, reason, amount, notes } = getParams(req);
  return await createRefund({ account_id, purchase_id, reason, amount, notes });
}
