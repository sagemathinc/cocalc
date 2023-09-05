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
  const created_by = await getAccountId(req);
  if (!created_by) {
    throw Error("must be signed in");
  }
  const {
    project_id,
    name,
    color,
    idle_timeout,
    autorestart,
    cloud,
    gpu,
    gpu_count,
    cpu,
    core_count,
    memory,
    spot,
  } = getParams(req);
  return await createServer({
    created_by,
    project_id,
    name,
    color,
    idle_timeout,
    autorestart,
    cloud,
    gpu,
    gpu_count,
    cpu,
    core_count,
    memory,
    spot,
  });
}
