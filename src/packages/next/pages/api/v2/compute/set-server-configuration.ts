/*
Set the title of a compute server.  The owner is the only one allowed
to do this.
*/

import getAccountId from "lib/account/get-account";
import setServerConfiguration from "@cocalc/server/compute/set-server-configuration";
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
  const { id, configuration } = getParams(req);
  await setServerConfiguration({
    account_id,
    id,
    configuration,
  });
  return { status: "ok" };
}
