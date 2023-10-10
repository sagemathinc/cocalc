/*
Returns a bash script that when run as root starts 
a compute server and connects it to a project.

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

async function get(req) {
  const { api_key, id } = getParams(req);
  // use api_key to get project, and also verify access:
  const project_id = await getProjectIdWithApiKey(api_key);
  if (!project_id) {
    throw Error("api_key query param must be a valid project api key");
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
  });
}
