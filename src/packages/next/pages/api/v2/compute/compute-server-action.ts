/*
Request to do an action (e.g., "start") with a compute server.
You must be the owner of the compute server.
*/

import getAccountId from "lib/account/get-account";
import computeServerAction from "@cocalc/server/compute/compute-server-action";
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
  await computeServerAction({
    account_id,
    id,
    action,
  });
  return { status: "ok" };
}
