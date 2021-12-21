/*
Get all projects signed in user collaborates on
that have at least one license applied to them.

See docs in @cocalc/server/licenses/get-projects.ts

Returns {projects:[...]} on success or {error:'a message'} on failure.
*/

import getLicensedProjects, {
  Project,
} from "@cocalc/server/licenses/get-projects";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  try {
    const projects = await get(req);
    res.json({ projects });
  } catch (err) {
    res.json({ error: `${err}` });
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
