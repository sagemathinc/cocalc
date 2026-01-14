import path from "node:path";
import { randomUUID } from "node:crypto";
import { mkdir, rm, stat } from "node:fs/promises";
import getLogger from "@cocalc/backend/logger";
import { SandboxedFilesystem } from "@cocalc/backend/sandbox";
import cpExec from "@cocalc/backend/sandbox/cp";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { getMasterConatClient } from "./master-status";
import { getLocalHostId } from "./sqlite/hosts";
import callHub from "@cocalc/conat/hub/call-hub";
import {
  ensureVolume,
  getVolume,
  resolveRusticRepo,
} from "./file-server";
import type { ProjectCopyRow } from "@cocalc/conat/hub/api/projects";

const logger = getLogger("project-host:pending-copies");

const COPY_STAGING_DIR = ".copy-staging";
const RESTORE_TIMEOUT_MS = 30 * 60 * 1000;

function normalizeRelativePath(raw: string, label: string): string {
  if (typeof raw !== "string") {
    throw new Error(`${label} must be a string`);
  }
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (path.posix.isAbsolute(trimmed)) {
    throw new Error(`${label} must be project-relative`);
  }
  const normalized = path.posix.normalize(trimmed);
  if (normalized === "." || normalized === "") return "";
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`${label} must not escape project root`);
  }
  return normalized;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function applyCopyRow(row: ProjectCopyRow): Promise<void> {
  const srcPath = normalizeRelativePath(row.src_path, "src_path");
  let destPath = normalizeRelativePath(row.dest_path, "dest_path");
  if (!destPath) {
    if (!srcPath) {
      throw new Error("dest_path cannot be empty when src_path is empty");
    }
    destPath = path.posix.basename(srcPath);
  }

  await ensureVolume(row.dest_project_id);
  const volume = await getVolume(row.dest_project_id);
  const projectRoot = volume.path;

  const destFs = new SandboxedFilesystem(projectRoot);
  const destAbs = await destFs.safeAbsPath(destPath);
  if (destAbs === projectRoot) {
    throw new Error("dest_path cannot be project root");
  }

  const force = row.options?.force ?? true;
  const destExists = await pathExists(destAbs);
  if (destExists && !force) {
    if (row.options?.errorOnExist) {
      throw new Error("destination already exists");
    }
    logger.debug("copy skipped (destination exists)", {
      dest_project_id: row.dest_project_id,
      dest_path: destPath,
    });
    return;
  }

  await mkdir(path.dirname(destAbs), { recursive: true });

  const stagingId = randomUUID();
  const stagingRel = path.posix.join(
    COPY_STAGING_DIR,
    stagingId,
    destPath,
  );
  const stagingRoot = path.join(projectRoot, COPY_STAGING_DIR, stagingId);
  await mkdir(stagingRoot, { recursive: true, mode: 0o700 });

  const repo = await resolveRusticRepo(row.src_project_id);
  const restoreFs = new SandboxedFilesystem(projectRoot, {
    rusticRepo: repo,
    host: `project-${row.src_project_id}`,
  });

  try {
    await restoreFs.rustic(
      [
        "restore",
        `${row.snapshot_id}${srcPath ? ":" + srcPath : ""}`,
        stagingRel,
      ],
      { timeout: RESTORE_TIMEOUT_MS },
    );
    const stagingAbs = await restoreFs.safeAbsPath(stagingRel);
    if (!(await exists(stagingAbs))) {
      throw new Error(`restore produced no data at ${stagingRel}`);
    }
    await cpExec(stagingAbs, destAbs, {
      ...row.options,
      recursive: row.options?.recursive ?? true,
      reflink: true,
    });
  } finally {
    await rm(stagingRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function reportCopyStatus(
  row: ProjectCopyRow,
  status: "done" | "failed",
  last_error?: string,
) {
  const client = getMasterConatClient();
  const hostId = getLocalHostId();
  if (!client || !hostId) return;
  try {
    await callHub({
      client,
      host_id: hostId,
      name: "hosts.updateCopyStatus",
      args: [
        {
          src_project_id: row.src_project_id,
          src_path: row.src_path,
          dest_project_id: row.dest_project_id,
          dest_path: row.dest_path,
          status,
          last_error,
        },
      ],
      timeout: 30000,
    });
  } catch (err) {
    logger.warn("failed to report copy status", { err: `${err}` });
  }
}

export async function applyPendingCopies({
  project_id,
  limit = 10,
}: {
  project_id?: string;
  limit?: number;
} = {}): Promise<void> {
  const client = getMasterConatClient();
  const hostId = getLocalHostId();
  if (!client || !hostId) {
    logger.debug("pending copies skipped (no master client or host id)");
    return;
  }

  let rows: ProjectCopyRow[] = [];
  try {
    rows = await callHub({
      client,
      host_id: hostId,
      name: "hosts.claimPendingCopies",
      args: [{ project_id, limit }],
      timeout: 30000,
    });
  } catch (err) {
    logger.warn("failed to claim pending copies", { err: `${err}` });
    return;
  }

  for (const row of rows) {
    try {
      await applyCopyRow(row);
      await reportCopyStatus(row, "done");
    } catch (err) {
      logger.warn("pending copy failed", {
        src_project_id: row.src_project_id,
        dest_project_id: row.dest_project_id,
        err: `${err}`,
      });
      await reportCopyStatus(row, "failed", `${err}`);
    }
  }
}

export function startCopyWorker(intervalMs = 30_000): () => void {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await applyPendingCopies();
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => {
    tick().catch((err) =>
      logger.debug("pending copy tick failed", { err: `${err}` }),
    );
  }, intervalMs);
  timer.unref();
  tick().catch((err) =>
    logger.debug("pending copy initial tick failed", { err: `${err}` }),
  );
  return () => clearInterval(timer);
}
