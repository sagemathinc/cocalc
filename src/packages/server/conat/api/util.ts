import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { materializeProjectHost } from "../route-project";

export async function assertCollab({ account_id, project_id }) {
  if (!account_id) {
    throw Error("must be signed in");
  }
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be a collaborator on project");
  }
  // Ensure we have a cached host for downstream conat routing. Best effort:
  // failures here should not block the caller.
  try {
    await materializeProjectHost(project_id);
  } catch (_err) {
    // ignore
  }
}
