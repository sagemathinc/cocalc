/*
Set a specific compute server template by id. This operation is designed for
administrators only.
*/

import getAccountId from "lib/account/get-account";
import { setTemplate } from "@cocalc/server/compute/templates";
import getParams from "lib/api/get-params";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";

import { apiRoute, apiRouteOperation } from "lib/api";
import { OkStatus } from "lib/api/status";
import {
  SetComputeServerTemplateInputSchema,
  SetComputeServerTemplateOutputSchema,
} from "lib/api/schema/compute/set-template";

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
    // admin only functionality for now.
    throw Error(
      "only admin are allowed to set compute server configuration templates",
    );
  }
  const { id, template } = getParams(req);
  await setTemplate({ account_id, id, template });
  return OkStatus;
}

export default apiRoute({
  setTemplate: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute", "Admin"],
    },
  })
    .input({
      contentType: "application/json",
      body: SetComputeServerTemplateInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: SetComputeServerTemplateOutputSchema,
      },
    ])
    .handler(handle),
});
