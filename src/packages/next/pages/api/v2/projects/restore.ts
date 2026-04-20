/*
API endpoint to restore a deleted a project, which sets the "delete" flag to `false` in
the database.
*/
import { isValidUUID } from "@cocalc/util/misc";
import getPool from "@cocalc/database/pool";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";

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

    // Atomic restore: only flip deleted=false if the project is still
    // restorable. Once the delete-projects hub has unlinked (users IS NULL) or
    // tombstoned (state.state='deleted') the row, restore would produce an
    // operationally dead project. Doing this as a single UPDATE closes the
    // TOCTOU window against a concurrent cleanup run.
    const pool = getPool();
    const { rowCount } = await pool.query(
      `UPDATE projects SET deleted = false
       WHERE project_id = $1
         AND users IS NOT NULL
         AND coalesce(state ->> 'state', '') <> 'deleted'`,
      [project_id],
    );
    if (!rowCount) {
      const { rows } = await pool.query(
        `SELECT (users IS NULL) AS unlinked,
                (state ->> 'state') = 'deleted' AS purged
         FROM projects WHERE project_id = $1`,
        [project_id],
      );
      if (rows.length === 0) {
        throw Error("no such project");
      }
      throw Error(
        "this project has been permanently deleted and cannot be restored; please contact support",
      );
    }

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
