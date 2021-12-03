/*
API endpoint to start a project running.

This requires the user to be signed in so they are allowed to use this project.
*/
import getAccountId from "lib/account/get-account";
import { getProject } from "@cocalc/server/projects/control";
import { isValidUUID } from "@cocalc/util/misc";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import isPost from "lib/api/is-post";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;

  const account_id = await getAccountId(req);
  const { project_id } = req.body;

  try {
    if (!isValidUUID(project_id)) {
      throw Error("project_id must be a valid uuid");
    }
    if (!account_id) {
      throw Error("must be signed in");
    }
    if (!isCollaborator({ account_id, project_id })) {
      throw Error("must be a collaborator to start project");
    }
    const project = getProject(project_id);
    await project.start();
    res.json({});
  } catch (err) {
    res.json({ error: err.message });
  }
}
