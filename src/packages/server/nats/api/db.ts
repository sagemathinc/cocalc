import { db } from "@cocalc/database";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import userQuery from "@cocalc/database/user-query";

export { userQuery };

export async function touch({
  account_id,
  project_id,
  path,
  action = "edit",
}: {
  account_id: string;
  project_id?: string;
  path?: string;
  action?: string;
}): Promise<void> {
  if (!project_id) {
    await db().touch({ account_id, action });
    return;
  }
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be collaborator on project");
  }
  const D = db();
  D.ensure_connection_to_project(project_id);
  await D.touch({ account_id, project_id, path, action });
  // TODO: we also connect still (this will of course go away very soon!!)
}
