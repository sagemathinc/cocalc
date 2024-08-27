/*
API endpoint to add a user to an existing project.

Permissions checks are performed by the underlying API call and are NOT
executed at this stage.

*/
import { db } from "@cocalc/database";
import { add_collaborators_to_projects } from "@cocalc/server/projects/collab";

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { apiRoute, apiRouteOperation } from "lib/api";
import { OkStatus } from "lib/api/status";
import {
  AddProjectCollaboratorInputSchema,
  AddProjectCollaboratorOutputSchema,
} from "lib/api/schema/projects/collaborators/add";

async function handle(req, res) {
  const { project_id, account_id } = getParams(req);
  const client_account_id = await getAccountId(req);

  try {
    if (!client_account_id) {
      throw Error("must be signed in");
    }

    await add_collaborators_to_projects(
      db(),
      client_account_id,
      [account_id],
      [project_id],
    );

    res.json(OkStatus);
  } catch (err) {
    res.json({ error: err.message });
  }
}

export default apiRoute({
  addProjectCollaborator: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Projects", "Admin"],
    },
  })
    .input({
      contentType: "application/json",
      body: AddProjectCollaboratorInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: AddProjectCollaboratorOutputSchema,
      },
    ])
    .handler(handle),
});
