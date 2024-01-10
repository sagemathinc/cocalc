/*
Get IMAGES.
*/

import getAccountId from "lib/account/get-account";
import getImages from "@cocalc/server/compute/images";
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
  // NOTE: only admins can specify a TTL
  const { ttl } = getParams(req, {
    allowGet: true,
  });
  if (ttl) {
    if (!(await userIsInGroup(account_id, "admin"))) {
      throw Error("only admin are allowed to specify the ttl");
    }
  }
  return await getImages(ttl);
}
