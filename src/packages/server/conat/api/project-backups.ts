import { client as fileServerClient } from "@cocalc/conat/files/file-server";
import { type SnapshotCounts } from "@cocalc/util/db-schema/projects";
import { assertCollab } from "./util";

// just *some* limit to avoid bugs/abuse

const MAX_BACKUPS_PER_PROJECT = 30;

export async function createBackup({
  account_id,
  project_id,
}: {
  account_id?: string;
  project_id: string;
  name?: string;
}): Promise<{ time: Date; id: string }> {
  await assertCollab({ account_id, project_id });
  return await fileServerClient().createBackup({
    project_id,
    limit: MAX_BACKUPS_PER_PROJECT,
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
  await fileServerClient().deleteBackup({ project_id, id });
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
  await fileServerClient().updateBackups({
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
  await fileServerClient().restoreBackup({
    project_id,
    id,
    path,
    dest,
  });
}

export async function getBackups({
  account_id,
  project_id,
}: {
  account_id?: string;
  project_id: string;
}) {
  await assertCollab({ account_id, project_id });
  return await fileServerClient().getBackups({
    project_id,
  });
}

export async function getBackupFiles({
  account_id,
  project_id,
  id,
}: {
  account_id?: string;
  project_id: string;
  id: string;
}) {
  await assertCollab({ account_id, project_id });
  return await fileServerClient().getBackupFiles({
    project_id,
    id,
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
