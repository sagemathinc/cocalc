/*
Let admin get all of the purchases for a specified user.
*/

import getAccountId from "lib/account/get-account";
import getPurchases from "@cocalc/server/purchases/get-purchases";
import getParams from "lib/api/get-params";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import throttle from "@cocalc/util/api/throttle";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const admin_account_id = await getAccountId(req);
  if (admin_account_id == null) {
    throw Error("must be signed in");
  }
  // This user MUST be an admin:
  if (!(await userIsInGroup(admin_account_id, "admin"))) {
    throw Error("only admins can use the get-purchases-admin endpoint");
  }
  throttle({
    account_id: admin_account_id,
    endpoint: "purchases/get-purchases-admin",
  });

  const {
    account_id,
    limit,
    offset,
    service,
    project_id,
    group,
    cutoff,
    thisMonth,
    day_statement_id,
    month_statement_id,
    no_statement,
    includeName,
  } = getParams(req);

  return await getPurchases({
    cutoff,
    thisMonth,
    limit,
    offset,
    service,
    account_id,
    project_id,
    group,
    day_statement_id,
    month_statement_id,
    no_statement,
    includeName,
  });
}
