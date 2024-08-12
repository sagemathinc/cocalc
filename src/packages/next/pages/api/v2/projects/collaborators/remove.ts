/*
API endpoint to remove a user from an existing project.

Permissions checks are performed by the underlying API call and are NOT
executed at this stage.

*/
import { db } from "@cocalc/database";
import { remove_collaborators_from_projects } from "@cocalc/server/projects/collab";

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { apiRoute, apiRouteOperation } from "lib/api";
import { OkStatus } from "lib/api/status";
import {
  RemoveProjectCollaboratorInputSchema,
  RemoveProjectCollaboratorOutputSchema,
} from "lib/api/schema/projects/collaborators/remove";

async function handle(req, res) {
  const { project_id, account_id } = getParams(req);
  const client_account_id = await getAccountId(req);

  try {
    if (!client_account_id) {
      throw Error("must be signed in");
    }

    await remove_collaborators_from_projects(
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
  removeProjectCollaborator: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Projects", "Admin"],
    },
  })
    .input({
      contentType: "application/json",
      body: RemoveProjectCollaboratorInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: RemoveProjectCollaboratorOutputSchema,
      },
    ])
    .handler(handle),
});
