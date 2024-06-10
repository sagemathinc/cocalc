/*
Set the title of a compute server.  The owner is the only one allowed
to do this.
*/

import getAccountId from "lib/account/get-account";
import setServerTitle from "@cocalc/server/compute/set-server-title";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  SetComputeServerTitleInputSchema,
  SetComputeServerTitleOutputSchema,
} from "lib/api/schema/compute/set-server-title";


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
  const { id, title } = getParams(req);
  await setServerTitle({
    account_id,
    id,
    title,
  });
  return { status: "ok" };
}

export default apiRoute({
  setServerTitle: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"]
    },
  })
    .input({
      contentType: "application/json",
      body: SetComputeServerTitleInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: SetComputeServerTitleOutputSchema,
      },
    ])
    .handler(handle),
});
