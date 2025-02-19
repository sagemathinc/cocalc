import { db } from "@cocalc/database";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import userQuery from "@cocalc/database/user-query";
import { callback2 } from "@cocalc/util/async-utils";

export { userQuery };

export async function touch({
  account_id,
  project_id,
  path,
  action = "edit",
}: {
  account_id?: string;
  project_id?: string;
  path?: string;
  action?: string;
}): Promise<void> {
  const D = db();
  if (!account_id) {
    throw Error("account_id must be set");
  }
  if (!project_id) {
    await callback2(D.touch, { account_id, action });
    return;
  }
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be collaborator on project");
  }
  // TODO: we also connect still (this will of course go away very soon!!)
  D.ensure_connection_to_project?.(project_id);
  await callback2(D.touch, { account_id, project_id, path, action });
}
