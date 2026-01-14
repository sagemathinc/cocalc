import getPool from "@cocalc/database/pool";
import userQuery from "@cocalc/database/user-query";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { getProject } from "@cocalc/server/projects/control";
import { getLogger } from "@cocalc/backend/logger";
import { isValidUUID } from "@cocalc/util/misc";

const log = getLogger("server:projects:delete");

interface DeleteProjectOptions {
  project_id: string;
  account_id?: string;
  skipPermissionCheck?: boolean;
}

export default async function deleteProject({
  project_id,
  account_id,
  skipPermissionCheck = false,
}: DeleteProjectOptions): Promise<void> {
  if (!isValidUUID(project_id)) {
    throw Error("project_id must be a valid uuid");
  }

  if (!skipPermissionCheck) {
    if (!account_id) {
      throw Error("must be signed in");
    }
    const admin = await userIsInGroup(account_id, "admin");
    const collaborator = admin
      ? true
      : await isCollaborator({ account_id, project_id });
    if (!collaborator) {
      throw Error("must be an owner to delete a project");
    }
  }

  const project = getProject(project_id);
  try {
    await project.stop();
  } catch (err) {
    log.debug("problem stopping project", { project_id, err });
  }

  if (!skipPermissionCheck && account_id) {
    await userQuery({
      account_id,
      query: {
        projects: {
          project_id,
          deleted: true,
        },
      },
    });
  } else {
    const pool = getPool();
    await pool.query("UPDATE projects SET deleted=true WHERE project_id=$1", [
      project_id,
    ]);
  }
}
