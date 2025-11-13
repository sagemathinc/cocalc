/*
API endpoint to list collaborators for a particular project.

Permissions checks are performed by the underlying API call and are NOT
executed at this stage.

*/
import userIsInGroup from "@cocalc/server/accounts/is-in-group";

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { apiRoute, apiRouteOperation } from "lib/api";
import {
  ListProjectCollaboratorsInputSchema,
  ListProjectCollaboratorsOutputSchema,
} from "lib/api/schema/projects/collaborators/list";
import getCollaborators from "lib/share/get-collaborators";

async function handle(req, res) {
  try {
    const client_account_id = await getAccountId(req);
    const { project_id } = getParams(req);

    // Check authentication
    //
    if (!client_account_id) {
      throw Error("must be signed in");
    }

    // Allow arbitrary project collaborator queries if client is an administrator.
    // Otherwise, restrict by client account id.
    //
    const collaborators = (await userIsInGroup(client_account_id, "admin"))
      ? await getCollaborators(project_id)
      : await getCollaborators(project_id, client_account_id);

    res.json(collaborators);
  } catch (err) {
    res.json({ error: err.message });
  }
}

export default apiRoute({
  listProjectCollaborators: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Projects", "Admin"],
    },
  })
    .input({
      contentType: "application/json",
      body: ListProjectCollaboratorsInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: ListProjectCollaboratorsOutputSchema,
      },
    ])
    .handler(handle),
});
