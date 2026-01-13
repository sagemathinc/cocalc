// Staged restore makes project restore atomic and crash-safe by restoring into a
// temporary subvolume, swapping on success, and cleaning stale state on reboot.
import { join, dirname } from "node:path";
import { readdir, rm, stat, writeFile } from "node:fs/promises";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { btrfs, sudo } from "@cocalc/file-server/btrfs/util";
import { isBtrfsSubvolume } from "@cocalc/file-server/btrfs/subvolume";
import { isValidUUID } from "@cocalc/util/misc";
import {
  type RestoreMode,
  type RestoreStagingHandle,
} from "@cocalc/conat/files/file-server";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("file-server:btrfs:restore-staging");

const RESTORE_MARKER = ".restore_in_progress";
const RESTORE_STAGING_ROOT = ".restore-staging";
const RESTORE_STALE_MS = 30 * 60 * 1000;

const restoring = new Set<string>();

export interface RestoreStagingProgress {
  step: "skip" | "prepare" | "lock" | "staging" | "finalize" | "cleanup";
  message?: string;
}

export type RestoreProgressFn = (
  progress: RestoreStagingProgress,
) => void | Promise<void>;

async function reportProgress(
  onProgress: RestoreProgressFn | undefined,
  step: RestoreStagingProgress["step"],
  message?: string,
) {
  if (!onProgress) return;
  await onProgress({ step, message });
}

function getOwner() {
  const uid = process.getuid?.();
  const gid = process.getgid?.();
  if (uid == null || gid == null) return null;
  return { uid, gid };
}

async function ensureStagingRoot(stagingRoot: string) {
  await sudo({ command: "mkdir", args: ["-p", stagingRoot] });
  const owner = getOwner();
  if (owner) {
    await sudo({
      command: "chown",
      args: [`${owner.uid}:${owner.gid}`, stagingRoot],
    }).catch(() => {});
  }
}

async function isMarkerFresh(markerPath: string): Promise<boolean> {
  if (!(await exists(markerPath))) return false;
  try {
    const info = await stat(markerPath);
    const ageMs = Date.now() - info.mtimeMs;
    return ageMs < RESTORE_STALE_MS;
  } catch {
    return false;
  }
}

async function deleteStagingPath(path: string): Promise<void> {
  if (!(await exists(path))) return;
  const isSubvolume = await isBtrfsSubvolume(path);
  if (!isSubvolume) {
    logger.warn("restore staging path is not btrfs; skipping delete", {
      stagingPath: path,
    });
    return;
  }
  await btrfs({
    args: ["subvolume", "delete", path],
    err_on_exit: true,
    verbose: false,
  });
}

async function ensureHomeSubvolume(home: string): Promise<void> {
  if (!(await exists(home))) return;
  const isSubvolume = await isBtrfsSubvolume(home);
  if (!isSubvolume) {
    throw new Error(`project home exists but is not a btrfs subvolume: ${home}`);
  }
}

async function homeHasData(home: string): Promise<boolean> {
  const entries = await readdir(home);
  const meaningful = entries.filter((entry) => entry !== ".snapshots");
  return meaningful.length > 0;
}

export async function beginRestoreStaging(opts: {
  project_id: string;
  home: string;
  restore?: RestoreMode;
  onProgress?: RestoreProgressFn;
}): Promise<RestoreStagingHandle | null> {
  const { project_id, home, restore, onProgress } = opts;
  if (!restore || restore === "none") {
    await reportProgress(onProgress, "skip", "restore disabled");
    return null;
  }
  if (restoring.has(project_id)) {
    await reportProgress(onProgress, "skip", "restore already in progress");
    return null;
  }

  const homeExists = await exists(home);
  if (homeExists) {
    await ensureHomeSubvolume(home);
    if (restore === "auto") {
      if (await homeHasData(home)) {
        await reportProgress(onProgress, "skip", "home already populated");
        return null;
      }
    }
  }

  const stagingRoot = join(dirname(home), RESTORE_STAGING_ROOT);
  const stagingPath = join(stagingRoot, `project-${project_id}`);
  const markerPath = join(stagingRoot, `${RESTORE_MARKER}.${project_id}`);

  try {
    await ensureStagingRoot(stagingRoot);
    if (await isMarkerFresh(markerPath)) {
      logger.warn("restore already in progress; skipping", { project_id });
      return null;
    }
    if (await exists(markerPath)) {
      await rm(markerPath, { force: true });
    }
  } catch (err) {
    logger.warn("restore marker check failed", { project_id, err: `${err}` });
    return null;
  }

  restoring.add(project_id);
  try {
    await writeFile(markerPath, `${new Date().toISOString()}\n`);
    await reportProgress(onProgress, "lock", "restore marker created");
    return {
      project_id,
      home,
      restore,
      homeExists,
      stagingRoot,
      stagingPath,
      markerPath,
    };
  } catch (err) {
    restoring.delete(project_id);
    await rm(markerPath, { force: true }).catch(() => {});
    throw err;
  }
}

export async function ensureRestoreStaging(
  handle: RestoreStagingHandle,
  opts: { onProgress?: RestoreProgressFn } = {},
): Promise<void> {
  const { stagingPath, stagingRoot, project_id } = handle;
  const { onProgress } = opts;
  await reportProgress(onProgress, "staging", "preparing staging subvolume");
  await ensureStagingRoot(stagingRoot);
  if (await exists(stagingPath)) {
    const isSubvolume = await isBtrfsSubvolume(stagingPath);
    if (!isSubvolume) {
      throw new Error(
        `restore staging path exists but is not a btrfs subvolume: ${stagingPath}`,
      );
    }
    await btrfs({
      args: ["subvolume", "delete", stagingPath],
      err_on_exit: true,
      verbose: false,
    });
  }
  await btrfs({
    args: ["subvolume", "create", stagingPath],
    err_on_exit: true,
    verbose: false,
  });
  const owner = getOwner();
  if (owner) {
    await sudo({
      command: "chown",
      args: [`${owner.uid}:${owner.gid}`, stagingPath],
    }).catch(() => {});
  }
  logger.info("restore staging ready", { project_id });
}

export async function finalizeRestoreStaging(
  handle: RestoreStagingHandle,
  opts: { onProgress?: RestoreProgressFn } = {},
): Promise<void> {
  const { home, stagingPath } = handle;
  const { onProgress } = opts;
  await reportProgress(onProgress, "finalize", "swapping staging into place");
  if (!(await exists(stagingPath))) {
    throw new Error(`restore staging path missing: ${stagingPath}`);
  }
  const homeExists = await exists(home);
  if (homeExists) {
    await ensureHomeSubvolume(home);
    const oldPath = `${home}.restore_old.${Date.now()}`;
    await sudo({ command: "mv", args: [home, oldPath] });
    await sudo({ command: "mv", args: [stagingPath, home] });
    await btrfs({
      args: ["subvolume", "delete", oldPath],
      err_on_exit: false,
      verbose: false,
    }).catch(() => {});
  } else {
    await sudo({ command: "mv", args: [stagingPath, home] });
  }
}

export async function releaseRestoreStaging(
  handle: RestoreStagingHandle,
  opts: { cleanupStaging?: boolean; onProgress?: RestoreProgressFn } = {},
): Promise<void> {
  const { markerPath, stagingPath, project_id } = handle;
  const { cleanupStaging, onProgress } = opts;
  restoring.delete(project_id);
  if (cleanupStaging) {
    await reportProgress(onProgress, "cleanup", "removing staging subvolume");
    await deleteStagingPath(stagingPath).catch(() => {});
  }
  await rm(markerPath, { force: true }).catch(() => {});
}

export async function cleanupRestoreStaging(opts: {
  root: string;
  onProgress?: RestoreProgressFn;
}): Promise<void> {
  const { root, onProgress } = opts;
  const stagingRoot = join(root, RESTORE_STAGING_ROOT);
  if (!(await exists(stagingRoot))) return;
  let entries: string[] = [];
  try {
    entries = await readdir(stagingRoot);
  } catch (err) {
    logger.warn("restore staging cleanup failed to read directory", {
      stagingRoot,
      err: `${err}`,
    });
    return;
  }

  for (const entry of entries) {
    if (!entry.startsWith(`${RESTORE_MARKER}.`)) continue;
    const projectId = entry.slice(`${RESTORE_MARKER}.`.length);
    if (!isValidUUID(projectId)) continue;
    const markerPath = join(stagingRoot, entry);
    let markerAgeMs = 0;
    try {
      const info = await stat(markerPath);
      markerAgeMs = Date.now() - info.mtimeMs;
    } catch {
      markerAgeMs = RESTORE_STALE_MS + 1;
    }
    if (markerAgeMs < RESTORE_STALE_MS) {
      continue;
    }
    const stagingPath = join(stagingRoot, `project-${projectId}`);
    await reportProgress(onProgress, "cleanup", `stale restore ${projectId}`);
    if (await exists(stagingPath)) {
      try {
        await deleteStagingPath(stagingPath);
      } catch (err) {
        logger.warn("restore staging cleanup failed", {
          stagingPath,
          err: `${err}`,
        });
      }
    }
    await rm(markerPath, { force: true }).catch(() => {});
    logger.info("restore staging cleanup completed", {
      project_id: projectId,
    });
  }
  const remaining = await readdir(stagingRoot);
  if (remaining.length === 0) {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}
