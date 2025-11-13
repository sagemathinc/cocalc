/*
API endpoint to stop a project running.

This requires the user to be signed in so they are allowed to use this project.
*/
import getAccountId from "lib/account/get-account";
import { getProject } from "@cocalc/server/projects/control";
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  StopProjectInputSchema,
  StopProjectOutputSchema,
} from "lib/api/schema/projects/stop";
import { OkStatus } from "../../../../lib/api/status";

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
    if (!(await isCollaborator({ account_id, project_id }))) {
      throw Error("must be a collaborator to stop project");
    }
    const project = getProject(project_id);
    await project.stop();
    res.json(OkStatus);
  } catch (err) {
    res.json({ error: err.message });
  }
}

export default apiRoute({
  stopProject: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Projects"],
    },
  })
    .input({
      contentType: "application/json",
      body: StopProjectInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: StopProjectOutputSchema,
      },
    ])
    .handler(handle),
});
