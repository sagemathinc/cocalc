/*
Get IMAGES.
*/

import getAccountId from "lib/account/get-account";
import { getImages } from "@cocalc/server/compute/images";
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
  let { noCache } = getParams(req, {
    allowGet: true,
  });
  if (noCache) {
    // NOTE: only admins can specify noCache
    if (!(await userIsInGroup(account_id, "admin"))) {
      throw Error("only admin are allowed to specify noCache");
    }
  }
  return await getImages({ noCache: !!noCache });
}
