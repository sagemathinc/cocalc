/*
Delete a compute server.  This deprovisions the VM and sets the
deleted flag on the compute server entry in the database.
*/

import getAccountId from "lib/account/get-account";
import deleteServer from "@cocalc/server/compute/delete-server";
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
  const { id } = getParams(req);
  await deleteServer({
    account_id,
    id,
  });
  return { status: "ok" };
}
