/*
Checks with the cloud provider and gets the server state.
*/

import getAccountId from "lib/account/get-account";
import { state } from "@cocalc/server/compute/control";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  GetComputeServerStateInputSchema,
  GetComputeServerStateOutputSchema
} from "lib/api/schema/compute/get-server-state";


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
  const { id } = getParams(req);
  return await state({
    account_id,
    id,
  });
}

export default apiRoute({
  getServerState: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"]
    },
  })
    .input({
      contentType: "application/json",
      body: GetComputeServerStateInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: GetComputeServerStateOutputSchema,
      },
    ])
    .handler(handle),
});
