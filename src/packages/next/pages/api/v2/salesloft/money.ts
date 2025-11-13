/*
Allows admins to get useful stats about a user's spending behavior.
This is the same data we put in salesloft about them.
*/

import { getMoneyData } from "@cocalc/server/salesloft/money";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";

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
    throw Error("only admins can use the salesloft/money endpoint");
  }

  const { account_id } = getParams(req);

  return await getMoneyData(account_id);
}
