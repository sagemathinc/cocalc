import { delay } from "awaiting";

import createProject from "@cocalc/server/projects/create";
export { createProject };

import isAdmin from "@cocalc/server/accounts/is-admin";
import { getProject } from "@cocalc/server/projects/control";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
import { type UserCopyOptions } from "@cocalc/util/db-schema/projects";
export * from "@cocalc/server/projects/collaborators";

export async function copyPathBetweenProjects(
  opts: UserCopyOptions,
): Promise<void> {
  const { account_id, src_project_id, target_project_id } = opts;
  if (!account_id) {
    throw Error("user must be signed in");
  }
  if (opts.target_path == null) {
    opts.target_path = opts.src_path;
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

import { db } from "@cocalc/database";
import { callback2 } from "@cocalc/util/async-utils";

export async function setQuotas(opts: {
  account_id: string;
  project_id: string;
  memory?: number;
  memory_request?: number;
  cpu_shares?: number;
  cores?: number;
  disk_quota?: number;
  mintime?: number;
  network?: number;
  member_host?: number;
  always_running?: number;
}): Promise<void> {
  if (!(await isAdmin(opts.account_id))) {
    throw Error("Must be an admin to do admin search.");
  }
  const database = db();
  await callback2(database.set_project_settings, {
    project_id: opts.project_id,
    settings: opts,
  });
  const project = await database.projectControl?.(opts.project_id);
  // @ts-ignore
  await project?.setAllQuotas();
}

export async function start({
  account_id,
  project_id,
}: {
  account_id: string;
  project_id: string;
}): Promise<void> {
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("must be collaborator on project to start it");
  }
  const project = await getProject(project_id);
  await project.start();
}

export async function stop({
  account_id,
  project_id,
}: {
  account_id: string;
  project_id: string;
}): Promise<void> {
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("must be collaborator on project to stop it");
  }
  const project = await getProject(project_id);
  await project.stop();
}
