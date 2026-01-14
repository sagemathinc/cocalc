import createProject from "@cocalc/server/projects/create";
export { createProject };
import getLogger from "@cocalc/backend/logger";
import isAdmin from "@cocalc/server/accounts/is-admin";
export * from "@cocalc/server/projects/collaborators";
import { type CopyOptions } from "@cocalc/conat/files/fs";
import { client as filesystemClient } from "@cocalc/conat/files/file-server";
export * from "@cocalc/server/conat/api/project-snapshots";
export * from "@cocalc/server/conat/api/project-backups";
import getPool from "@cocalc/database/pool";
import {
  updateAuthorizedKeysOnHost as updateAuthorizedKeysOnHostControl,
} from "@cocalc/server/project-host/control";
import { getProject } from "@cocalc/server/projects/control";
import { moveProjectToHost } from "@cocalc/server/projects/move";
import {
  cancelCopy as cancelCopyDb,
  listCopiesForProject,
} from "@cocalc/server/projects/copy-db";
import { createLro, updateLro } from "@cocalc/server/lro/lro-db";
import { publishLroEvent, publishLroSummary } from "@cocalc/server/lro/stream";
import { lroStreamName } from "@cocalc/conat/lro/names";
import { SERVICE as PERSIST_SERVICE } from "@cocalc/conat/persist/util";
import { assertCollab } from "./util";
import {
  getMove,
  type ProjectMoveRow,
} from "@cocalc/server/project-host/move-db";
import type { ProjectCopyRow } from "@cocalc/conat/hub/api/projects";

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
}): Promise<{
  op_id: string;
  scope_type: "project";
  scope_id: string;
  service: string;
  stream_name: string;
}> {
  if (!account_id) {
    throw Error("user must be signed in");
  }
  await assertCollab({ account_id, project_id: src.project_id });
  if (dest.project_id !== src.project_id) {
    await assertCollab({ account_id, project_id: dest.project_id });
  }
  const op = await createLro({
    kind: "copy-path-between-projects",
    scope_type: "project",
    scope_id: src.project_id,
    created_by: account_id,
    routing: "hub",
    input: { src, dests: [dest], options },
    status: "queued",
  });
  await publishLroSummary({
    scope_type: op.scope_type,
    scope_id: op.scope_id,
    summary: op,
  });
  publishLroEvent({
    scope_type: op.scope_type,
    scope_id: op.scope_id,
    op_id: op.op_id,
    event: {
      type: "progress",
      ts: Date.now(),
      phase: "queued",
      message: "queued",
      progress: 0,
    },
  }).catch(() => {});
  return {
    op_id: op.op_id,
    scope_type: "project",
    scope_id: src.project_id,
    service: PERSIST_SERVICE,
    stream_name: lroStreamName(op.op_id),
  };
}

export async function listPendingCopies({
  account_id,
  project_id,
  include_completed,
}: {
  account_id?: string;
  project_id: string;
  include_completed?: boolean;
}): Promise<ProjectCopyRow[]> {
  await assertCollab({ account_id, project_id });
  return await listCopiesForProject({ project_id, include_completed });
}

export async function cancelPendingCopy({
  account_id,
  src_project_id,
  src_path,
  dest_project_id,
  dest_path,
}: {
  account_id?: string;
  src_project_id: string;
  src_path: string;
  dest_project_id: string;
  dest_path: string;
}): Promise<void> {
  await assertCollab({ account_id, project_id: dest_project_id });
  await cancelCopyDb({
    src_project_id,
    src_path,
    dest_project_id,
    dest_path,
  });
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
  await assertCollab({ account_id, project_id });
  if (compute_server_id) {
    // I'm not sure how this will work...
    throw Error(`getDiskQuota: disk quota for compute server not implemented`);
  }
  // Route directly to the project-host that owns this project so quota reflects
  // the correct btrfs volume.
  const client = filesystemClient({ project_id });
  return await client.getQuota({ project_id });
}

export async function start({
  account_id,
  project_id,
  restore: _restore,
  wait = true,
}: {
  account_id: string;
  project_id: string;
  // not used; passed through for typing compatibility with project-host
  run_quota?: any;
  // not used; passed through for typing compatibility with project-host
  restore?: "none" | "auto" | "required";
  wait?: boolean;
}): Promise<{
  op_id: string;
  scope_type: "project";
  scope_id: string;
  service: string;
  stream_name: string;
}> {
  await assertCollab({ account_id, project_id });
  const op = await createLro({
    kind: "project-start",
    scope_type: "project",
    scope_id: project_id,
    created_by: account_id,
    routing: "hub",
    input: { project_id },
    status: "queued",
  });
  await publishLroSummary({
    scope_type: op.scope_type,
    scope_id: op.scope_id,
    summary: op,
  });
  publishLroEvent({
    scope_type: op.scope_type,
    scope_id: op.scope_id,
    op_id: op.op_id,
    event: {
      type: "progress",
      ts: Date.now(),
      phase: "queued",
      message: "queued",
      progress: 0,
    },
  }).catch(() => {});

  log.debug("start", { project_id, op_id: op.op_id });
  const project = await getProject(project_id);
  const response = {
    op_id: op.op_id,
    scope_type: "project" as const,
    scope_id: project_id,
    service: PERSIST_SERVICE,
    stream_name: lroStreamName(op.op_id),
  };
  const runStart = async () => {
    const running = await updateLro({
      op_id: op.op_id,
      status: "running",
      error: null,
    });
    if (running) {
      await publishLroSummary({
        scope_type: running.scope_type,
        scope_id: running.scope_id,
        summary: running,
      });
    }
    try {
      await project.start({ lro_op_id: op.op_id });
      const progress_summary = {
        done: 1,
        total: 1,
        failed: 0,
        queued: 0,
        expired: 0,
        applying: 0,
        canceled: 0,
      };
      const updated = await updateLro({
        op_id: op.op_id,
        status: "succeeded",
        progress_summary,
        result: progress_summary,
        error: null,
      });
      if (updated) {
        await publishLroSummary({
          scope_type: updated.scope_type,
          scope_id: updated.scope_id,
          summary: updated,
        });
      }
    } catch (err) {
      const updated = await updateLro({
        op_id: op.op_id,
        status: "failed",
        error: `${err}`,
      });
      if (updated) {
        await publishLroSummary({
          scope_type: updated.scope_type,
          scope_id: updated.scope_id,
          summary: updated,
        });
      }
      throw err;
    }
  };

  if (wait) {
    await runStart();
  } else {
    runStart().catch((err) =>
      log.warn("async start failed", { project_id, err: `${err}` }),
    );
  }
  return response;
}

export async function stop({
  account_id,
  project_id,
}: {
  account_id: string;
  project_id: string;
}): Promise<void> {
  await assertCollab({ account_id, project_id });
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
  await assertCollab({ account_id, project_id });
  await updateAuthorizedKeysOnHostControl(project_id);
}

export async function moveProject({
  account_id,
  project_id,
  dest_host_id,
}: {
  account_id: string;
  project_id: string;
  dest_host_id?: string;
}): Promise<void> {
  await assertCollab({ account_id, project_id });
  if (!dest_host_id) {
    throw Error("dest_host_id must be specified");
  }
  await moveProjectToHost({
    project_id,
    dest_host_id,
    account_id,
  });
}

export async function getMoveStatus({
  account_id,
  project_id,
}): Promise<ProjectMoveRow | undefined> {
  await assertCollab({ account_id, project_id });
  return await getMove(project_id);
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
