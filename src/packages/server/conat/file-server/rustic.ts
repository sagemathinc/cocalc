import { getVolume } from "./index";
import { type SnapshotCounts } from "@cocalc/util/db-schema/projects";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:conat:file-server:rustic");

// create new complete backup of the project; this first snapshots the
// project, makes a backup of the snapshot, then deletes the snapshot, so the
// backup is guranteed to be consistent.
export async function createBackup({
  project_id,
  limit,
}: {
  project_id: string;
  limit?: number;
}): Promise<{ time: Date; id: string }> {
  logger.debug("backup", { project_id });
  const vol = await getVolume(project_id);
  return await vol.rustic.backup({ limit });
}

// restore the given path in the backup to the given dest.  The default
// path is '' (the whole project) and the default destination is the
// same as the path.
export async function restoreBackup({
  project_id,
  id,
  path,
  dest,
}: {
  project_id: string;
  id: string;
  path?: string;
  dest?: string;
}): Promise<void> {
  logger.debug("restore", { project_id, id, path, dest });
  const vol = await getVolume(project_id);
  await vol.rustic.restore({ id, path, dest });
}

export async function deleteBackup({
  project_id,
  id,
}: {
  project_id: string;
  id: string;
}): Promise<void> {
  logger.debug("deleteBackup", { project_id, id });
  const vol = await getVolume(project_id);
  await vol.rustic.forget({ id });
}

export async function updateBackups({
  project_id,
  counts,
  limit,
}: {
  project_id: string;
  counts?: Partial<SnapshotCounts>;
  limit?: number;
}): Promise<void> {
  const vol = await getVolume(project_id);
  await vol.rustic.update(counts, { limit });
}

// Return list of id's and timestamps of all backups of this project.
export async function getBackups({
  project_id,
}: {
  project_id: string;
}): Promise<
  {
    id: string;
    time: Date;
  }[]
> {
  logger.debug("getBackups", { project_id });
  const vol = await getVolume(project_id);
  return await vol.rustic.snapshots();
}
// Return list of all files in the given backup.
export async function getBackupFiles({
  project_id,
  id,
}: {
  project_id: string;
  id: string;
}): Promise<string[]> {
  logger.debug("getBackupFiles", { project_id, id });
  const vol = await getVolume(project_id);
  return await vol.rustic.ls({ id });
}
