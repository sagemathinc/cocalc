/*
Get event log for a particular compute server.
*/

import getAccountId from "lib/account/get-account";
import { getTitle } from "@cocalc/server/compute/get-servers";
import getParams from "lib/api/get-params";

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
  const { id } = getParams(req, {
    allowGet: true,
  });
  return await getTitle({ id, account_id });
}
