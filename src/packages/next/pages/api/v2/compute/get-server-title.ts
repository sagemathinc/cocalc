/*
Get server title and color for a particular compute server.
*/

import getAccountId from "lib/account/get-account";
import { getTitle } from "@cocalc/server/compute/get-servers";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  GetComputeServerTitleInputSchema,
  GetComputeServerTitleOutputSchema,
} from "lib/api/schema/compute/get-server-title";

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
  return await getTitle({ id, account_id });
}

export default apiRoute({
  getServerTitle: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"],
    },
  })
    .input({
      contentType: "application/json",
      body: GetComputeServerTitleInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: GetComputeServerTitleOutputSchema,
      },
    ])
    .handler(handle),
});
