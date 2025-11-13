/*
Set the cloud of a compute server.  The owner is the only one allowed
to do this.  Changing the cloud clears the configuration, since it is
not meaningful between clouds.
*/

import getAccountId from "lib/account/get-account";
import setServerCloud from "@cocalc/server/compute/set-server-cloud";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import { OkStatus } from "lib/api/status";
import {
  SetComputeServerCloudInputSchema,
  SetComputeServerCloudOutputSchema,
} from "lib/api/schema/compute/set-server-cloud";

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
  const { id, cloud } = getParams(req);
  await setServerCloud({
    account_id,
    id,
    cloud,
  });
  return OkStatus;
}

export default apiRoute({
  setServerCloud: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"],
    },
  })
    .input({
      contentType: "application/json",
      body: SetComputeServerCloudInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: SetComputeServerCloudOutputSchema,
      },
    ])
    .handler(handle),
});
