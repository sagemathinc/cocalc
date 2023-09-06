/*
Controlling compute servers
*/

import getAccountId from "lib/account/get-account";
import { start, stop, state } from "@cocalc/server/compute/control";
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
  const { id, action } = getParams(req);

  switch (action) {
    case "start":
      return await start({ id, account_id });
    case "stop":
      return await stop({ id, account_id });
    case "state": // update the state by using the cloud provider api
      return { state: await state({ id, account_id }) };
    default:
      throw Error(`unknown action ${action}`);
  }
}
