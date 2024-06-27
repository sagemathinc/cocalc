/*
Request to do an action (e.g., "start") with a compute server.
You must be the owner of the compute server.
*/
import computeServerAction from "@cocalc/server/compute/compute-server-action";

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import { OkStatus } from "lib/api/status";
import {
  ComputeServerActionInputSchema,
  ComputeServerActionOutputSchema,
} from "lib/api/schema/compute/compute-server-action";

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
  const { id, action } = getParams(req);
  await computeServerAction({
    account_id,
    id,
    action,
  });
  return OkStatus;
}

export default apiRoute({
  serverAction: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"],
    },
  })
    .input({
      contentType: "application/json",
      body: ComputeServerActionInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: ComputeServerActionOutputSchema,
      },
    ])
    .handler(handle),
});
