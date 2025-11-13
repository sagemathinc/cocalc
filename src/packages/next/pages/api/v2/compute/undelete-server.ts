/*
Undelete a compute server.
*/

import getAccountId from "lib/account/get-account";
import undeleteServer from "@cocalc/server/compute/undelete-server";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import { OkStatus } from "lib/api/status";
import {
  UndeleteComputeServerInputSchema,
  UndeleteComputeServerOutputSchema,
} from "lib/api/schema/compute/undelete-server";

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
  await undeleteServer({
    account_id,
    id,
  });
  return OkStatus;
}

export default apiRoute({
  undeleteServer: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"],
    },
  })
    .input({
      contentType: "application/json",
      body: UndeleteComputeServerInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: UndeleteComputeServerOutputSchema,
      },
    ])
    .handler(handle),
});
