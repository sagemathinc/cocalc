/*
Get metrics for a cloud file system.
*/

import getProjectOrAccountId from "lib/account/get-account";
import getMetrics from "@cocalc/server/compute/cloud-filesystem/get-metrics";
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
  const account_id = await getProjectOrAccountId(req);
  if (!account_id) {
    throw Error("invalid auth");
  }
  const { cloud_filesystem_id, limit, offset } = getParams(req);

  return await getMetrics({
    account_id,
    cloud_filesystem_id,
    limit,
    offset,
  });
}
