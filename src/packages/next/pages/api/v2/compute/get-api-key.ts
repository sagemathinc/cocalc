/*
Gets the api key of the compute server.

Calling this always invalidates any existing key for
this server and creates a new one.

This is only allowed right now for on prem servers.
*/

import getAccountId from "lib/account/get-account";
import { getServer } from "@cocalc/server/compute/get-servers";
import getParams from "lib/api/get-params";
import {
  setProjectApiKey,
  deleteProjectApiKey,
} from "@cocalc/server/compute/project-api-key";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  GetComputeServerAPIKeyInputSchema,
  GetComputeServerAPIKeyOutputSchema,
} from "lib/api/schema/compute/get-api-key";


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
  const { id } = getParams(req); // security: definitely needs to be a POST request
  const server = await getServer({ id, account_id });
  if (server.cloud != "onprem") {
    throw Error("getting api key is only supported for onprem compute servers");
  }
  if (server.account_id != account_id) {
    throw Error("you must be the owner of the compute server");
  }
  await deleteProjectApiKey({ account_id, server });
  return await setProjectApiKey({ account_id, server });
}

export default apiRoute({
  getServerAPIKey: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"]
    },
  })
    .input({
      contentType: "application/json",
      body: GetComputeServerAPIKeyInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: GetComputeServerAPIKeyOutputSchema,
      },
    ])
    .handler(handle),
});
