/*
Let compute servers
*/

import getAccountId from "lib/account/get-account";
import getComputeServers from "@cocalc/server/compute/get-compute-servers";
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
  const { project_id, created_by, started_by } = getParams(req, {
    allowGet: true,
  });
  return await getComputeServers({
    account_id,
    project_id,
    created_by,
    started_by,
  });
}
