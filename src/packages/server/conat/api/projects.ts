import createProject from "@cocalc/server/projects/create";
export { createProject };
import isAdmin from "@cocalc/server/accounts/is-admin";
import { getProject } from "@cocalc/server/projects/control";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
export * from "@cocalc/server/projects/collaborators";
import { type CopyOptions } from "@cocalc/conat/files/fs";
import { client as filesystemClient } from "@cocalc/conat/files/file-server";
export * from "@cocalc/server/conat/api/project-snapshots";
export * from "@cocalc/server/conat/api/project-backups";

export async function copyPathBetweenProjects({
  src,
  dest,
  options,
  account_id,
}: {
  src: { project_id: string; path: string | string[] };
  dest: { project_id: string; path: string };
  options?: CopyOptions;
  account_id?: string;
}): Promise<void> {
  if (!account_id) {
    throw Error("user must be signed in");
  }
  if (!(await isCollaborator({ account_id, project_id: src.project_id }))) {
    throw Error("user must be collaborator on source project");
  }
  if (
    dest.project_id != src.project_id &&
    !(await isCollaborator({ account_id, project_id: dest.project_id }))
  ) {
    throw Error("user must be collaborator on dest project");
  }

  const client = filesystemClient();
  await client.cp({ src, dest, options });
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

export async function getDiskQuota({
  account_id,
  project_id,
}: {
  account_id: string;
  project_id: string;
}): Promise<{ used: number; size: number }> {
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be a collaborator on project to get quota");
  }
  const client = filesystemClient();
  return await client.getQuota({ project_id });
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
