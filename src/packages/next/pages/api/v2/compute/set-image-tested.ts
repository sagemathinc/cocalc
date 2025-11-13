/*
Set whether or not the image a compute server with given id is using has been tested.
This is used by admins when manually doing final integration testing for a new image
on some cloud provider.
*/

import getAccountId from "lib/account/get-account";
import { setImageTested } from "@cocalc/server/compute/control";
import getParams from "lib/api/get-params";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";

import { apiRoute, apiRouteOperation } from "lib/api";
import { OkStatus } from "lib/api/status";
import {
  SetComputeServerImageTestedInputSchema,
  SetComputeServerImageTestedOutputSchema,
} from "lib/api/schema/compute/set-image-tested";

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
  if (!(await userIsInGroup(account_id, "admin"))) {
    throw Error("only admin are allowed to image tested status");
  }
  const { id, tested } = getParams(req);
  await setImageTested({ id, account_id, tested });
  return OkStatus;
}

export default apiRoute({
  setImageTested: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"],
    },
  })
    .input({
      contentType: "application/json",
      body: SetComputeServerImageTestedInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: SetComputeServerImageTestedOutputSchema,
      },
    ])
    .handler(handle),
});
