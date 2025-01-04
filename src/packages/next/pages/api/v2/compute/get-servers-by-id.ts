/*
Get multiple compute servers by their list of global ids.
*/

import getAccountId from "lib/account/get-account";
import { getServersById } from "@cocalc/server/compute/get-servers";
import getParams from "lib/api/get-params";
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
  const account_id = await getAccountId(req);
  if (!account_id) {
    throw Error("must be signed in");
  }
  throttle({
    account_id,
    endpoint: "compute/get-servers-by-id",
  });
  const { ids, fields } = getParams(req);
  let servers = await getServersById({
    account_id,
    ids,
    fields,
  });
  return servers;
}
