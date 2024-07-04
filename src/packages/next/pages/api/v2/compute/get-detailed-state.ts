/*
Get detailed state for a compute server.

This can get just the state for a given component.

One application of this is that the file system sync daemon
can check for the error message to be cleared.
*/

import getProjectOrAccountId from "lib/account/get-account";
import { getDetailedState } from "@cocalc/server/compute/set-detailed-state";
import getParams from "lib/api/get-params";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  GetDetailedServerStateInputSchema,
  GetDetailedServerStateOutputSchema,
} from "lib/api/schema/compute/get-detailed-state";


async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  // This is a bit complicated because it can be used by a project api key,
  // in which case project_id must not be passed in, or it can be auth'd
  // by a normal api key or account, in which case project_id must be passed in.
  const project_or_account_id = await getProjectOrAccountId(req);
  if (!project_or_account_id) {
    throw Error("invalid auth");
  }
  const { id, name, project_id: project_id0 } = getParams(req);

  let project_id;
  if (!project_id0) {
    project_id = project_or_account_id;
  } else {
    if (
      !(await isCollaborator({
        account_id: project_or_account_id,
        project_id: project_id0,
      }))
    ) {
      throw Error("must be a collaborator on project with compute server");
    }
    project_id = project_id0;
  }

  return await getDetailedState({
    project_id,
    id,
    name,
  });
}

export default apiRoute({
  getDetailedServerState: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"]
    },
  })
    .input({
      contentType: "application/json",
      body: GetDetailedServerStateInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "text/plain",
        body: GetDetailedServerStateOutputSchema,
      },
    ])
    .handler(handle),
});
