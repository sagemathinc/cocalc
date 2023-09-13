/*
Create a compute server
*/

import getAccountId from "lib/account/get-account";
import createServer from "@cocalc/server/compute/create-server";
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
  const {
    project_id,
    name,
    color,
    idle_timeout,
    autorestart,
    cloud,
    configuration,
  } = getParams(req);
  return await createServer({
    account_id,
    project_id,
    name,
    color,
    idle_timeout,
    autorestart,
    cloud,
    configuration,
  });
}
