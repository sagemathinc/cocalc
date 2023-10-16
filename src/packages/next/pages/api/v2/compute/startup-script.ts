/*
Returns a bash script that when run as root starts
a compute server and connects it to a project.

This is meant to be used for on prem compute servers,
hence it includes installing the /cocalc code and the "user" user.
*/

import { getStartupScript } from "@cocalc/server/compute/control";
import { getAccountWithApiKey as getProjectIdWithApiKey } from "@cocalc/server/api/manage";
import getParams from "lib/api/get-params";
import getPool from "@cocalc/database/pool";

export default async function handle(req, res) {
  try {
    res.send(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

export async function get(req) {
  const { api_key, id: id0 } = getParams(req, { allowGet: true });
  // use api_key to get project, and also verify access:
  const id = parseInt(id0);
  return await getScript({ api_key, id });
}

export async function getScript({
  api_key,
  id,
}: {
  api_key: string;
  id: number;
}): Promise<string> {
  const project_id = await getProjectIdWithApiKey(api_key);
  if (!project_id) {
    throw Error("api_key must be a valid project api key");
  }
  const { rows } = await getPool().query(
    "SELECT COUNT(*) AS count FROM compute_servers WHERE id=$1 AND project_id=$2",
    [id, project_id],
  );
  if (rows[0]?.count != 1) {
    throw Error(`no compute server with id=${id} in project with this api key`);
  }
  return await getStartupScript({
    id,
    api_key,
    installUser: true,
  });
}
