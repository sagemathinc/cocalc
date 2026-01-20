import {
  client as fileServerClient,
  type RestoreMode,
  type RestoreStagingHandle,
} from "@cocalc/conat/files/file-server";
import { type SnapshotCounts } from "@cocalc/util/db-schema/projects";
import { assertCollab } from "./util";
import { createLro } from "@cocalc/server/lro/lro-db";
import { publishLroEvent, publishLroSummary } from "@cocalc/conat/lro/stream";
import { lroStreamName } from "@cocalc/conat/lro/names";
import { SERVICE as PERSIST_SERVICE } from "@cocalc/conat/persist/util";

// just *some* limit to avoid bugs/abuse

const MAX_BACKUPS_PER_PROJECT = 30;

export async function createBackup({
  account_id,
  project_id,
  tags,
}: {
  account_id?: string;
  project_id: string;
  name?: string;
  tags?: string[];
}): Promise<{
  op_id: string;
  scope_type: "project";
  scope_id: string;
  service: string;
  stream_name: string;
}> {
  await assertCollab({ account_id, project_id });
  const op = await createLro({
    kind: "project-backup",
    scope_type: "project",
    scope_id: project_id,
    created_by: account_id,
    routing: "hub",
    input: { project_id, tags },
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
    scope_id: project_id,
    service: PERSIST_SERVICE,
    stream_name: lroStreamName(op.op_id),
  };
}

export async function deleteBackup({
  account_id,
  project_id,
  id,
}: {
  account_id?: string;
  project_id: string;
  id: string;
}) {
  await assertCollab({ account_id, project_id });
  await fileServerClient({ project_id }).deleteBackup({ project_id, id });
}

export async function updateBackups({
  account_id,
  project_id,
  counts,
}: {
  account_id?: string;
  project_id: string;
  counts?: Partial<SnapshotCounts>;
}) {
  await assertCollab({ account_id, project_id });
  await fileServerClient({ project_id }).updateBackups({
    project_id,
    counts,
    limit: MAX_BACKUPS_PER_PROJECT,
  });
}

export async function restoreBackup({
  account_id,
  project_id,
  id,
  path,
  dest,
}: {
  account_id?: string;
  project_id: string;
  id: string;
  path?: string;
  dest?: string;
}): Promise<{
  op_id: string;
  scope_type: "project";
  scope_id: string;
  service: string;
  stream_name: string;
}> {
  await assertCollab({ account_id, project_id });
  const op = await createLro({
    kind: "project-restore",
    scope_type: "project",
    scope_id: project_id,
    created_by: account_id,
    routing: "hub",
    input: { project_id, id, path, dest },
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
    scope_id: project_id,
    service: PERSIST_SERVICE,
    stream_name: lroStreamName(op.op_id),
  };
}

export async function beginRestoreStaging({
  account_id,
  project_id,
  home,
  restore,
}: {
  account_id?: string;
  project_id: string;
  home?: string;
  restore?: RestoreMode;
}): Promise<RestoreStagingHandle | null> {
  await assertCollab({ account_id, project_id });
  return await fileServerClient({ project_id }).beginRestoreStaging({
    project_id,
    home,
    restore,
  });
}

export async function ensureRestoreStaging({
  account_id,
  handle,
}: {
  account_id?: string;
  handle: RestoreStagingHandle;
}) {
  await assertCollab({ account_id, project_id: handle.project_id });
  await fileServerClient({ project_id: handle.project_id }).ensureRestoreStaging({
    handle,
  });
}

export async function finalizeRestoreStaging({
  account_id,
  handle,
}: {
  account_id?: string;
  handle: RestoreStagingHandle;
}) {
  await assertCollab({ account_id, project_id: handle.project_id });
  await fileServerClient({ project_id: handle.project_id }).finalizeRestoreStaging({
    handle,
  });
}

export async function releaseRestoreStaging({
  account_id,
  handle,
  cleanupStaging,
}: {
  account_id?: string;
  handle: RestoreStagingHandle;
  cleanupStaging?: boolean;
}) {
  await assertCollab({ account_id, project_id: handle.project_id });
  await fileServerClient({ project_id: handle.project_id }).releaseRestoreStaging({
    handle,
    cleanupStaging,
  });
}

export async function cleanupRestoreStaging({
  account_id,
  project_id,
  root,
}: {
  account_id?: string;
  project_id: string;
  root?: string;
}) {
  await assertCollab({ account_id, project_id });
  await fileServerClient({ project_id }).cleanupRestoreStaging({ root });
}

export async function getBackups({
  account_id,
  project_id,
  indexed_only,
}: {
  account_id?: string;
  project_id: string;
  indexed_only?: boolean;
}) {
  await assertCollab({ account_id, project_id });
  return await fileServerClient({ project_id }).getBackups({
    project_id,
    indexed_only,
  });
}

export async function getBackupFiles({
  account_id,
  project_id,
  id,
  path,
}: {
  account_id?: string;
  project_id: string;
  id: string;
  path?: string;
}) {
  await assertCollab({ account_id, project_id });
  return await fileServerClient({ project_id }).getBackupFiles({
    project_id,
    id,
    path,
  });
}

export async function findBackupFiles({
  account_id,
  project_id,
  glob,
  iglob,
  path,
  ids,
}: {
  account_id?: string;
  project_id: string;
  glob?: string[];
  iglob?: string[];
  path?: string;
  ids?: string[];
}) {
  await assertCollab({ account_id, project_id });
  return await fileServerClient({ project_id }).findBackupFiles({
    project_id,
    glob,
    iglob,
    path,
    ids,
  });
}

export async function getBackupFileText({
  account_id,
  project_id,
  id,
  path,
  max_bytes,
}: {
  account_id?: string;
  project_id: string;
  id: string;
  path: string;
  max_bytes?: number;
}) {
  await assertCollab({ account_id, project_id });
  return await fileServerClient({ project_id }).getBackupFileText({
    project_id,
    id,
    path,
    max_bytes,
  });
}

export async function getBackupQuota({
  account_id,
  project_id,
}: {
  account_id?: string;
  project_id: string;
}) {
  await assertCollab({ account_id, project_id });
  return { limit: MAX_BACKUPS_PER_PROJECT };
}
