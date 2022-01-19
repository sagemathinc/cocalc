/*
Get all projects signed in user collaborates on
that have at least one license applied to them.

See docs in @cocalc/server/licenses/get-projects.ts

Returns [Project1, Project2, ...] on success or {error:'a message'} on failure.
For the fields in the projects, see @cocalc/server/licenses/get-projects.ts
*/

import getLicensedProjects, {
  Project,
} from "@cocalc/server/licenses/get-projects";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req): Promise<Project[]> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    return [];
  }
  return await getLicensedProjects(account_id);
}
