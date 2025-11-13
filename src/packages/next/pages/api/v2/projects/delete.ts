/*
API endpoint to delete a project, which sets the "delete" flag to `true` in the database.
*/
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import removeAllLicensesFromProject from "@cocalc/server/licenses/remove-all-from-project";
import { getProject } from "@cocalc/server/projects/control";
import userQuery from "@cocalc/database/user-query";
import { isValidUUID } from "@cocalc/util/misc";

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { apiRoute, apiRouteOperation } from "lib/api";
import { OkStatus } from "lib/api/status";
import {
  DeleteProjectInputSchema,
  DeleteProjectOutputSchema,
} from "lib/api/schema/projects/delete";

async function handle(req, res) {
  const { project_id } = getParams(req);
  const account_id = await getAccountId(req);

  try {
    if (!isValidUUID(project_id)) {
      throw Error("project_id must be a valid uuid");
    }
    if (!account_id) {
      throw Error("must be signed in");
    }

    // If client is not an administrator, they must be a project collaborator in order to
    // delete a project.
    if (
      !(await userIsInGroup(account_id, "admin")) &&
      !(await isCollaborator({ account_id, project_id }))
    ) {
      throw Error("must be an owner to delete a project");
    }

    // Remove all project licenses
    //
    await removeAllLicensesFromProject({ project_id });

    // Stop project
    //
    const project = getProject(project_id);
    await project.stop();

    // Set "deleted" flag. We do this last to ensure that the project is not consuming any
    // resources while it is in the deleted state.
    //
    await userQuery({
      account_id,
      query: {
        projects: {
          project_id,
          deleted: true,
        },
      },
    });

    res.json(OkStatus);
  } catch (err) {
    res.json({ error: err.message });
  }
}

export default apiRoute({
  deleteProject: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Projects", "Admin"],
    },
  })
    .input({
      contentType: "application/json",
      body: DeleteProjectInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: DeleteProjectOutputSchema,
      },
    ])
    .handler(handle),
});
