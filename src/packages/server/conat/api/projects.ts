import createProject from "@cocalc/server/projects/create";
export { createProject };
import isAdmin from "@cocalc/server/accounts/is-admin";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
export * from "@cocalc/server/projects/collaborators";
import { type CopyOptions } from "@cocalc/conat/files/fs";
import { client as filesystemClient } from "@cocalc/conat/files/file-server";
import { type SnapshotCounts } from "@cocalc/util/db-schema/projects";

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

import { client as fileServerClient } from "@cocalc/conat/files/file-server";

// NOTES about snapshots:

// TODO: in some cases we *might* only allow the project owner to delete snapshots
// create a new snapshot of a project

// just *some* limit to avoid bugs/abuse

const MAX_SNAPSHOTS_PER_PROJECT = 100;

export async function createSnapshot({
  account_id,
  project_id,
  name,
}: {
  account_id?: string;
  project_id: string;
  name?: string;
}) {
  if (!account_id) {
    throw Error("must be signed in");
  }
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be a collaborator on project");
  }
  await fileServerClient().createSnapshot({
    project_id,
    name,
    limit: MAX_SNAPSHOTS_PER_PROJECT,
  });
}

export async function deleteSnapshot({
  account_id,
  project_id,
  name,
}: {
  account_id?: string;
  project_id: string;
  name: string;
}) {
  if (!account_id) {
    throw Error("must be signed in");
  }
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be a collaborator on project");
  }
  await fileServerClient().deleteSnapshot({ project_id, name });
}

export async function updateSnapshots({
  account_id,
  project_id,
  counts,
}: {
  account_id?: string;
  project_id: string;
  counts?: Partial<SnapshotCounts>;
}) {
  if (!account_id) {
    throw Error("must be signed in");
  }
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be a collaborator on project");
  }
  await fileServerClient().updateSnapshots({
    project_id,
    counts,
    limit: MAX_SNAPSHOTS_PER_PROJECT,
  });
}

export async function getSnapshotQuota({
  account_id,
  project_id,
}: {
  account_id?: string;
  project_id: string;
}) {
  if (!account_id) {
    throw Error("must be signed in");
  }
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be a collaborator on project");
  }
  return { limit: MAX_SNAPSHOTS_PER_PROJECT };
}
