/*
Get event log for a particular compute server.
*/

import getAccountId from "lib/account/get-account";
import { getEventLog } from "@cocalc/server/compute/event-log";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  GetComputeServerLogInputSchema,
  GetComputeServerLogOutputSchema,
} from "lib/api/schema/compute/get-log";

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
  return await getEventLog({ id, account_id });
}

export default apiRoute({
  getLog: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"],
    },
  })
    .input({
      contentType: "application/json",
      body: GetComputeServerLogInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: GetComputeServerLogOutputSchema,
      },
    ])
    .handler(handle),
});
