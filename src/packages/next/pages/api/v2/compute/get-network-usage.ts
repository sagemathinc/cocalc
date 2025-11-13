/*
Get network usage by a specific server during a particular period of time.
*/

import getAccountId from "lib/account/get-account";
import { getNetworkUsage } from "@cocalc/server/compute/control";
import getParams from "lib/api/get-params";
import { getServer } from "@cocalc/server/compute/get-servers";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  GetComputeServerNetworkUsageInputSchema,
  GetComputeServerNetworkUsageOutputSchema,
} from "lib/api/schema/compute/get-network-usage";


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
  const { id, start, end } = getParams(req);
  if (!start) {
    throw Error("must specify start");
  }
  if (!end) {
    throw Error("must specify end");
  }
  const server = await getServer({ account_id, id });
  return await getNetworkUsage({
    server,
    start: new Date(start),
    end: new Date(end),
  });
}

export default apiRoute({
  getNetworkUsage: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"]
    },
  })
    .input({
      contentType: "application/json",
      body: GetComputeServerNetworkUsageInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: GetComputeServerNetworkUsageOutputSchema,
      },
    ])
    .handler(handle),
});
