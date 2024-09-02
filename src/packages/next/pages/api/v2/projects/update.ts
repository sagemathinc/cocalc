/*
Set project title, description, etc.
*/

import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import setProject from "@cocalc/server/projects/set-one";

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

import { OkStatus } from "lib/api/status";
import { apiRoute, apiRouteOperation } from "lib/api";
import {
  UpdateProjectInputSchema,
  UpdateProjectOutputSchema,
} from "lib/api/schema/projects/update";

async function handle(req, res) {
  try {
    await get(req);
    res.json(OkStatus);
  } catch (err) {
    res.json({ error: `${err.message ? err.message : err}` });
    return;
  }
}

async function get(req) {
  const client_account_id = await getAccountId(req);

  if (client_account_id == null) {
    throw Error("Must be signed in to update project.");
  }

  const { account_id, project_id, title, description, name } = getParams(req);

  // If the API client is an admin, they may act on any project on behalf of any account.
  // Otherwise, the client may only update projects for which they are listed as
  // collaborators.
  //
  if (account_id && !(await userIsInGroup(client_account_id, "admin"))) {
    throw Error(
      "The `account_id` field may only be specified by account administrators.",
    );
  }

  return setProject({
    acting_account_id: account_id || client_account_id,
    project_id,
    project_update: {
      title,
      description,
      name,
    },
  });
}

export default apiRoute({
  updateProject: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Projects", "Admin"],
    },
  })
    .input({
      contentType: "application/json",
      body: UpdateProjectInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: UpdateProjectOutputSchema,
      },
    ])
    .handler(handle),
});
