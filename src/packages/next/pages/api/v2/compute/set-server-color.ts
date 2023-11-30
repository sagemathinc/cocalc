/*
Set the color of a compute server
*/

import getAccountId from "lib/account/get-account";
import setServerColor from "@cocalc/server/compute/set-server-color";
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
  const { id, color } = getParams(req);
  await setServerColor({
    account_id,
    id,
    color,
  });
  return { status: "ok" };
}
