/*
Run code in a project.
*/

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import callProject from "@cocalc/server/projects/call";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

export default async function handle(req, res) {
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
    },
  });
  // event and id don't make sense for http post api
  delete resp.event;
  delete resp.id;
  return resp;
}
