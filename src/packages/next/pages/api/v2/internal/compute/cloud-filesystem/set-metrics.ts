/*
Set metrics for a cloud file system.   This is used from the cloud-filesystem container
on a node to submit periodic information about the operations on file system, so we
can provide information about usage to users.

Example use, where 'sk-eTUKbl2lkP9TgvFJ00001n' is a project api key, where the given compute
server and cloud file system are part of the given project.

curl -sk -u sk-eTUKbl2lkP9TgvFJ00001n: -d '{"cloud_filesystem_id":18, "compute_server_id":"13", "bytes_get": 97574275, "bytes_put": 609263741, "bytes_used":1609263741, "objects_get": 5075, "objects_put": 34333, "objects_delete":2}}' -H 'Content-Type: application/json' https://cocalc.com/api/v2/compute/cloud-filesystem/set-metrics


*/

import getProjectOrAccountId from "lib/account/get-account";
import setMetrics from "@cocalc/server/compute/cloud-filesystem/set-metrics";
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
  const project_id = await getProjectOrAccountId(req);
  if (!project_id) {
    throw Error("invalid auth");
  }
  const {
    compute_server_id,
    cloud_filesystem_id,
    process_uptime,
    bytes_used,
    bytes_get,
    bytes_put,
    objects_get,
    objects_put,
    objects_delete,
  } = getParams(req);

  await setMetrics({
    project_id,
    compute_server_id,
    process_uptime,
    cloud_filesystem_id,
    bytes_used,
    bytes_get,
    bytes_put,
    objects_get,
    objects_put,
    objects_delete,
  });
  return { status: "ok" };
}
