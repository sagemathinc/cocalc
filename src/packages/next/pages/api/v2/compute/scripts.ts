/*
Returns a bash script that when run as root starts
a compute server and connects it to a project.

This is meant to be used for on prem compute servers,
hence it includes installing the /cocalc code and the "user" user.
*/

import {
  getStartupScript,
  getStopScript,
  getDeprovisionScript,
} from "@cocalc/server/compute/control";
import { getAccountWithApiKey } from "@cocalc/server/api/manage";
import getParams from "lib/api/get-params";
import getPool from "@cocalc/database/pool";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  ComputeServerScriptsInputSchema,
  ComputeServerScriptsOutputSchema,
} from "lib/api/schema/compute/scripts";

async function handle(req, res) {
  try {
    res.send(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

export async function get(req) {
  const { api_key, id: id0, action } = getParams(req);
  // use api_key to get project, and also verify access:
  const id = parseInt(id0);
  return await getScript({ api_key, id, action });
}

export async function getScript({
  api_key,
  id,
  action,
}: {
  api_key: string;
  id: number;
  action: "start" | "stop" | "deprovision";
}): Promise<string> {
  const { project_id } = (await getAccountWithApiKey(api_key)) ?? {};
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
  if (action == "start") {
    return await getStartupScript({
      id,
      api_key,
      installUser: true,
    });
  } else if (action == "stop") {
    return await getStopScript({
      id,
      api_key,
    });
  } else if (action == "deprovision") {
    return await getDeprovisionScript({
      id,
      api_key,
    });
  } else {
    throw Error(`unknown action=${action}`);
  }
}

export default apiRoute({
  scripts: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"],
    },
  })
    .input({
      contentType: "application/json",
      body: ComputeServerScriptsInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "text/plain",
        body: ComputeServerScriptsOutputSchema,
      },
    ])
    .handler(handle),
});
