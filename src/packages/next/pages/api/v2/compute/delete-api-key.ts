/*
Delete the api key of the given compute server, if one is set.
*/

import getAccountId from "lib/account/get-account";
import { getServer } from "@cocalc/server/compute/get-servers";
import getParams from "lib/api/get-params";
import { deleteProjectApiKey } from "@cocalc/server/compute/project-api-key";

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
  const { id } = getParams(req); // security: definitely needs to be a POST request
  const server = await getServer({ id, account_id });
  if (server.account_id != account_id) {
    throw Error("you must be the owner of the compute server");
  }
  await deleteProjectApiKey({ account_id, server });
  return { status: "ok" };
}
