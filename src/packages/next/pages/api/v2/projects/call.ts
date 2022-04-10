/*
API endpoint that makes it possible to send a message to a project
that the user is a collaborator on and get back a response.

See cocalc/src/packages/server/projects/connection/call.ts
for a list of messages.
*/

import call from "@cocalc/server/projects/connection/call";
import getParams from "lib/api/get-params";
import getAccountId from "lib/account/get-account";
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

export default async function handle(req, res) {
  const account_id = await getAccountId(req);
  try {
    const { project_id, mesg } = getParams(req, ["project_id", "mesg"]);
    res.json(await callProject({ account_id, project_id, mesg }));
  } catch (err) {
    res.json({ error: err.message });
  }
}

// also used by the latex api call
export async function callProject({
  account_id,
  project_id,
  mesg,
}): Promise<any> {
  if (!isValidUUID(account_id)) {
    throw Error("user must be authenticated");
  }
  if (!isValidUUID(project_id)) {
    throw Error("must specify project_id");
  }

  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("authenticated user must be a collaborator on the project");
  }
  return await call({ project_id, mesg });
}
