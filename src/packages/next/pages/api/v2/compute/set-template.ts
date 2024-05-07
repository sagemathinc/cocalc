/*
Set whether or not the image a compute server with given id is using has been tested.
This is used by admins when manually doing final integration testing for a new image
on some cloud provider.
*/

import getAccountId from "lib/account/get-account";
import { setTemplate } from "@cocalc/server/compute/templates";
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
  const account_id = await getAccountId(req);
  if (!account_id) {
    throw Error("must be signed in");
  }
  if (!(await userIsInGroup(account_id, "admin"))) {
    // admin only functionality for now.
    throw Error(
      "only admin are allowed to set compute server configuration templates",
    );
  }
  const { id, template } = getParams(req);
  await setTemplate({ account_id, id, template });
  return { status: "ok" };
}
