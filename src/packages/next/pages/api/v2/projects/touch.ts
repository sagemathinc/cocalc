/*
API endpoint to touch a project, thus updating the last_edited (and last_active
timestamps), and ensure the project is running.

This requires the user to be signed in so they are allowed to use this project.
*/
import getAccountId from "lib/account/get-account";
import { getProject } from "@cocalc/server/projects/control";
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  const account_id = await getAccountId(req);
  const { project_id } = getParams(req);

  try {
    if (!isValidUUID(project_id)) {
      throw Error("project_id must be a valid uuid");
    }
    if (!account_id) {
      throw Error("must be signed in");
    }
    if (!(await isCollaborator({ account_id, project_id }))) {
      throw Error("must be a collaborator to stop project");
    }
    const project = getProject(project_id);
    await project.touch(account_id);
    res.json({});
  } catch (err) {
    res.json({ error: err.message });
  }
}
