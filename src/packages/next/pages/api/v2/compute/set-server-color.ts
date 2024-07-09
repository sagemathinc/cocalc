/*
Set the color of a compute server
*/

import getAccountId from "lib/account/get-account";
import setServerColor from "@cocalc/server/compute/set-server-color";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import { OkStatus } from "lib/api/status";
import {
  SetComputeServerColorInputSchema,
  SetComputeServerColorOutputSchema,
} from "lib/api/schema/compute/set-server-color";

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
  const { id, color } = getParams(req);
  await setServerColor({
    account_id,
    id,
    color,
  });
  return OkStatus;
}

export default apiRoute({
  setServerColor: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"],
    },
  })
    .input({
      contentType: "application/json",
      body: SetComputeServerColorInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: SetComputeServerColorOutputSchema,
      },
    ])
    .handler(handle),
});
