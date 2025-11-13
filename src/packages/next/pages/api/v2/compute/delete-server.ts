/*
Delete a compute server.  This deprovisions the VM and sets the
deleted flag on the compute server entry in the database.
*/

import getAccountId from "lib/account/get-account";
import deleteServer from "@cocalc/server/compute/delete-server";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import { OkStatus } from "lib/api/status";
import {
  DeleteComputeServerInputSchema,
  DeleteComputeServerOutputSchema,
} from "lib/api/schema/compute/delete-server";

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
  await deleteServer({
    account_id,
    id,
  });
  return OkStatus;
}

export default apiRoute({
  deleteServer: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"],
    },
  })
    .input({
      contentType: "application/json",
      body: DeleteComputeServerInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: DeleteComputeServerOutputSchema,
      },
    ])
    .handler(handle),
});
