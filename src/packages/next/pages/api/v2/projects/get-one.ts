/* Get projects that belongs to the authenticated user.
   If the user has no projects, creates one.
   If they have projects, returns the most recently active one.
*/

import getAccountId from "lib/account/get-account";
import create from "@cocalc/server/projects/create";
import getProjects from "@cocalc/server/projects/get";
import { isValidUUID } from "@cocalc/util/misc";

export default async function handle(req, res) {
  const account_id = await getAccountId(req);
  try {
    res.json(await getOneProject(account_id));
  } catch (err) {
    res.json({ error: err.message });
  }
}

// This is also used by the latex api endpoint.
export async function getOneProject(
  account_id
): Promise<{ project_id: string; title?: string }> {
  if (!isValidUUID(account_id)) {
    throw Error("user must be authenticated");
  }
  const projects = await getProjects({ account_id, limit: 1 });
  if (projects.length >= 1) {
    return projects[0];
  }
  const title = "Untitled Project";
  return { project_id: await create({ account_id, title }), title };
}
