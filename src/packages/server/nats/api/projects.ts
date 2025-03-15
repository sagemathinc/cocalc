import createProject from "@cocalc/server/projects/create";
export { createProject };

import { type UserCopyOptions } from "@cocalc/util/db-schema/projects";
import { getProject } from "@cocalc/server/projects/control";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { delay } from "awaiting";

export async function copyPathBetweenProjects(
  opts: UserCopyOptions,
): Promise<void> {
  const { account_id, src_project_id, target_project_id } = opts;
  if (!account_id) {
    throw Error("user must be signed in");
  }
  if (!(await isCollaborator({ account_id, project_id: src_project_id }))) {
    throw Error("user must be collaborator on source project");
  }
  if (
    !!target_project_id &&
    target_project_id != src_project_id &&
    !(await isCollaborator({ account_id, project_id: target_project_id }))
  ) {
    throw Error("user must be collaborator on target project");
  }

  await doCopyPathBetweenProjects(opts);
}

// do the actual copy, awaiting as long as it takes to finish,
// with no security checks.
async function doCopyPathBetweenProjects(opts: UserCopyOptions) {
  const project = await getProject(opts.src_project_id);
  await project.copyPath({
    ...opts,
    path: opts.src_path,
    wait_until_done: true,
  });
  if (opts.debug_delay_ms) {
    await delay(opts.debug_delay_ms);
  }
}
