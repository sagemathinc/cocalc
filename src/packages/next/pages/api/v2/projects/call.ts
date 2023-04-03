/*
API endpoint that makes it possible to send a message to a project
that the user is a collaborator on and get back a response.

See cocalc/src/packages/server/projects/connection/call.ts
for a list of messages.
*/

import getParams from "lib/api/get-params";
import getAccountId from "lib/account/get-account";
import callProject from "@cocalc/server/projects/call";

export default async function handle(req, res) {
  const account_id = await getAccountId(req);
  try {
    const { project_id, mesg } = getParams(req);
    res.json(await callProject({ account_id, project_id, mesg }));
  } catch (err) {
    res.json({ error: err.message });
  }
}
