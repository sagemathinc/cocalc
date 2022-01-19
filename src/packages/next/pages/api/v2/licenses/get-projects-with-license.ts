/*
Get all projects that have a given license applied to them.  Signed in user
must be a manager of the given license so they are allowed access to this data.

See docs in @cocalc/server/licenses/get-projects-with-license.ts

Returns [Project1, Project2, ...] on success or {error:'a message'} on failure.
For the fields in the projects, see @cocalc/server/licenses/get-projects.ts
*/

import getProjectsWithLicense, {
  Project,
} from "@cocalc/server/licenses/get-projects-with-license";
import { isManager } from "@cocalc/server/licenses/get-license";
import getAccountId from "lib/account/get-account";
import isPost from "lib/api/is-post";
import { isValidUUID } from "@cocalc/util/misc";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;
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
    throw Error("must be signed in as a manager of the license");
  }
  const { license_id } = req.body;
  if (!isValidUUID(license_id)) {
    throw Error("license_id must be a valid uuid");
  }
  if (!(await isManager(license_id, account_id))) {
    throw Error("signed in user must be a manager of the license");
  }
  return await getProjectsWithLicense(license_id);
}
