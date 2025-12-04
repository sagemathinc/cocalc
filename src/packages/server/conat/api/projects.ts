import createProject from "@cocalc/server/projects/create";
export { createProject };
import getLogger from "@cocalc/backend/logger";
import isAdmin from "@cocalc/server/accounts/is-admin";
import isCollaborator from "@cocalc/server/projects/is-collaborator";
export * from "@cocalc/server/projects/collaborators";
import { type CopyOptions } from "@cocalc/conat/files/fs";
import { client as filesystemClient } from "@cocalc/conat/files/file-server";
export * from "@cocalc/server/conat/api/project-snapshots";
export * from "@cocalc/server/conat/api/project-backups";
import getPool from "@cocalc/database/pool";
import { updateAuthorizedKeysOnHost as updateAuthorizedKeysOnHostControl } from "@cocalc/server/project-host/control";
import { getProject } from "@cocalc/server/projects/control";

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

const log = getLogger("server:conat:api:projects");

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
  compute_server_id = 0,
}: {
  account_id: string;
  project_id: string;
  compute_server_id?: number;
}): Promise<{ used: number; size: number }> {
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("user must be a collaborator on project to get quota");
  }
  if (compute_server_id) {
    // I'm not sure how this will work...
    throw Error(`getDiskQuota: disk quota for compute server not implemented`);
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
  // not used; passed through for typing compatibility with project-host
  run_quota?: any;
}): Promise<void> {
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("must be collaborator on project to start it");
  }
  log.debug("start", { project_id });
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
  log.debug("stop", { project_id });
  const project = await getProject(project_id);
  await project.stop();
}

export async function updateAuthorizedKeysOnHost({
  account_id,
  project_id,
}: {
  account_id: string;
  project_id: string;
}): Promise<void> {
  if (!(await isCollaborator({ account_id, project_id }))) {
    throw Error("must be collaborator on project to update ssh keys");
  }
  await updateAuthorizedKeysOnHostControl(project_id);
}

export async function getSshKeys({
  project_id,
}: {
  project_id?: string;
} = {}): Promise<string[]> {
  if (!project_id) {
    throw Error("project_id must be specified");
  }
  const pool = getPool();
  const keys: string[] = [];
  const f = async (query) => {
    const { rows } = await pool.query(query, [project_id]);
    for (const x of rows) {
      keys.push((x as any).key);
    }
  };

  // The two crazy looking queries below get the ssh public keys
  // for a specific project, both the project-specific keys *AND*
  // the global keys for collabs that happen to apply to the project.
  // We use complicated jsonb so these are weird/complicated queries,
  // which AI wrote (with some uuid casting by me), but they work
  // fine as far as I can tell.
  await Promise.all([
    f(`
SELECT
  ssh_key ->> 'value' AS key
FROM projects
CROSS JOIN LATERAL jsonb_each(users) AS u(user_id, user_data)
CROSS JOIN LATERAL jsonb_each(u.user_data -> 'ssh_keys') AS k(fingerprint, ssh_key)
WHERE project_id = $1;
`),
    f(`
SELECT  kdata ->> 'value' AS key
FROM projects p
CROSS JOIN LATERAL jsonb_object_keys(p.users) AS u(account_id)
JOIN accounts a ON a.account_id = u.account_id::uuid
CROSS JOIN LATERAL jsonb_each(a.ssh_keys) AS k(fingerprint, kdata)
WHERE p.project_id = $1;
`),
  ]);

  return Array.from(new Set<string>(keys));
}
