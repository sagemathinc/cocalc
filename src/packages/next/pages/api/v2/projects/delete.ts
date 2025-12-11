/*
API endpoint to delete a project, which sets the "delete" flag to `true` in the database.
*/
import deleteProject from "@cocalc/server/projects/delete";
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
    if (!account_id) {
      throw Error("must be signed in");
    }

    await deleteProject({ account_id, project_id });
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
