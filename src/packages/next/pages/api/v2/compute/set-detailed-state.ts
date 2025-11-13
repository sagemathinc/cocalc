/*
Set the state of a component.   This is mainly used from the backend to convey information to user
about what is going on in a compute server.

Example use, where 'sk-eTUKbl2lkP9TgvFJ00001n' is a project api key.

curl -sk -u sk-eTUKbl2lkP9TgvFJ00001n: -d '{"id":"13","name":"foo","value":"bar389"}' -H 'Content-Type: application/json' https://cocalc.com/api/v2/compute/set-detailed-state
*/

import getProjectOrAccountId from "lib/account/get-account";
import setDetailedState from "@cocalc/server/compute/set-detailed-state";
import getParams from "lib/api/get-params";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

import { apiRoute, apiRouteOperation } from "lib/api";
import { OkStatus } from "lib/api/status";
import {
  SetDetailedServerStateInputSchema,
  SetDetailedServerStateOutputSchema,
} from "lib/api/schema/compute/set-detailed-state";

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
  // TODO: I don't think this is ever in practice used by anything but a project -- maybe by
  // account just for testing?
  const project_or_account_id = await getProjectOrAccountId(req);
  if (!project_or_account_id) {
    throw Error("invalid auth");
  }
  const {
    id,
    name,
    state,
    extra,
    timeout,
    progress,
    project_id: project_id0,
  } = getParams(req);

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

  await setDetailedState({
    project_id,
    id,
    name,
    state,
    extra,
    timeout,
    progress,
  });
  return OkStatus;
}

export default apiRoute({
  setDetailedState: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"],
    },
  })
    .input({
      contentType: "application/json",
      body: SetDetailedServerStateInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: SetDetailedServerStateOutputSchema,
      },
    ])
    .handler(handle),
});
