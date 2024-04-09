/*
Remove ban from a user.  This is ONLY allowed for admins.
*/

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import { removeUserBan } from "@cocalc/server/accounts/ban";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const account_id0 = await getAccountId(req);
  if (account_id0 == null) {
    throw Error("must be signed in");
  }
  // This user MUST be an admin:
  if (!(await userIsInGroup(account_id0, "admin"))) {
    throw Error("only admins can ban users");
  }

  const { account_id } = getParams(req);
  await removeUserBan(account_id);
  return { status: "success" };
}
