/*
 *  This file is part of CoCalc: Copyright © 2024 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Run code in a project.
*/

import callProject from "@cocalc/server/projects/call";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { apiRoute, apiRouteOperation } from "lib/api";
import { ExecInputSchema, ExecOutputSchema } from "lib/api/schema/exec";

async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const account_id = await getAccountId(req);
  if (!account_id) {
    throw Error("must be signed in");
  }
  // See ExecOpts from @cocalc/util/db-schema/projects
  const {
    project_id,
    compute_server_id,
    filesystem,
    path,
    command,
    args,
    timeout,
    max_output,
    bash,
    aggregate,
    err_on_exit,
    env,
    async_call,
    async_get,
    async_stats,
    async_await,
  } = getParams(req);

  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be a collaborator on the project");
  }

  const resp = await callProject({
    account_id,
    project_id,
    mesg: {
      event: "project_exec",
      project_id,
      compute_server_id,
      filesystem,
      path,
      command,
      args,
      timeout,
      max_output,
      bash,
      aggregate,
      err_on_exit,
      env,
      async_call,
      async_get,
      async_stats,
      async_await,
    },
  });
  // event and id don't make sense for http post api
  delete resp.event;
  delete resp.id;
  return resp;
}

export default apiRoute({
  exec: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Utils"],
    },
  })
    .input({
      contentType: "application/json",
      body: ExecInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/octet-stream",
        body: ExecOutputSchema,
      },
    ])
    .handler(handle),
});
