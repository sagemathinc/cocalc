/*
Set the title of a compute server.  The owner is the only one allowed
to do this.
*/

import getAccountId from "lib/account/get-account";
import setServerConfiguration from "@cocalc/server/compute/set-server-configuration";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import { OkStatus } from "lib/api/status";
import {
  SetServerConfigurationInputSchema,
  SetServerConfigurationOutputSchema,
} from "lib/api/schema/compute/set-server-configuration";

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
  const { id, configuration } = getParams(req);
  await setServerConfiguration({
    account_id,
    id,
    configuration,
  });
  return OkStatus;
}

export default apiRoute({
  setServerConfiguration: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"],
    },
  })
    .input({
      contentType: "application/json",
      body: SetServerConfigurationInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: SetServerConfigurationOutputSchema,
      },
    ])
    .handler(handle),
});
