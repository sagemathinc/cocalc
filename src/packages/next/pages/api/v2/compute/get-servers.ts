/*
Get compute servers
*/

import getAccountId from "lib/account/get-account";
import getServers from "@cocalc/server/compute/get-servers";
import getParams from "lib/api/get-params";
import { apiRoute, apiRouteOperation } from "lib/api";
import {
  GetComputeServersInputSchema,
  GetComputeServersOutputSchema,
} from "lib/api/schema/compute/get-servers";
import throttle from "@cocalc/util/api/throttle";

async function handle(req, res) {
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
  throttle({
    account_id,
    endpoint: "compute/get-servers",
  });
  const { project_id, id } = getParams(req);
  return await getServers({
    account_id,
    project_id,
    id,
  });
}

export default apiRoute({
  getServers: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"],
    },
  })
    .input({
      contentType: "application/json",
      body: GetComputeServersInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: GetComputeServersOutputSchema,
      },
    ])
    .handler(handle),
});
