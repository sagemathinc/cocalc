/*
Set the title of a compute server.  The owner is the only one allowed
to do this.
*/

import getAccountId from "lib/account/get-account";
import setServerTitle from "@cocalc/server/compute/set-server-title";
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
  const { id, title } = getParams(req);
  await setServerTitle({
    account_id,
    id,
    title,
  });
  return { status: "ok" };
}
