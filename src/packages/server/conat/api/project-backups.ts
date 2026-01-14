import {
  client as fileServerClient,
  type RestoreMode,
  type RestoreStagingHandle,
} from "@cocalc/conat/files/file-server";
import { type SnapshotCounts } from "@cocalc/util/db-schema/projects";
import { assertCollab } from "./util";

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
}): Promise<{ time: Date; id: string }> {
  await assertCollab({ account_id, project_id });
  return await fileServerClient({ project_id }).createBackup({
    project_id,
    limit: MAX_BACKUPS_PER_PROJECT,
    tags,
  });
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
}) {
  await assertCollab({ account_id, project_id });
  await fileServerClient({ project_id }).restoreBackup({
    project_id,
    id,
    path,
    dest,
  });
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
}: {
  account_id?: string;
  project_id: string;
}) {
  await assertCollab({ account_id, project_id });
  return await fileServerClient({ project_id }).getBackups({
    project_id,
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
