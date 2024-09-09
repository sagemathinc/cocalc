/*
API endpoint to restore a deleted a project, which sets the "delete" flag to `false` in
the database.
*/
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import userQuery from "@cocalc/database/user-query";

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { apiRoute, apiRouteOperation } from "lib/api";
import { OkStatus } from "lib/api/status";
import {
  RestoreProjectInputSchema,
  RestoreProjectOutputSchema,
} from "lib/api/schema/projects/restore";

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
    // restore a project.
    if (
      !(await userIsInGroup(account_id, "admin")) &&
      !(await isCollaborator({ account_id, project_id }))
    ) {
      throw Error("must be an owner to restore a project");
    }

    await userQuery({
      account_id,
      query: {
        projects: {
          project_id,
          deleted: false,
        },
      },
    });

    res.json(OkStatus);
  } catch (err) {
    res.json({ error: err.message });
  }
}

export default apiRoute({
  restoreProject: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Projects", "Admin"],
    },
  })
    .input({
      contentType: "application/json",
      body: RestoreProjectInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: RestoreProjectOutputSchema,
      },
    ])
    .handler(handle),
});
