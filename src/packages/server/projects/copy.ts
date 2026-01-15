import path from "node:path";
import getLogger from "@cocalc/backend/logger";
import { conat } from "@cocalc/backend/conat";
import getPool from "@cocalc/database/pool";
import {
  client as fileServerClient,
  type Fileserver,
} from "@cocalc/conat/files/file-server";
import { type CopyOptions } from "@cocalc/conat/files/fs";
import { insertCopyRowIfMissing, upsertCopyRow } from "./copy-db";

const logger = getLogger("server:projects:copy");

const COPY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_BACKUPS_PER_PROJECT = 30;
const COPY_FILES_TIMEOUT_MS = 30 * 60 * 1000;

type CopyStep = {
  step: string;
  message?: string;
  detail?: any;
};

type CopyProgress = (update: CopyStep) => void;

type CopySource = { project_id: string; path: string | string[] };
type CopyDest = { project_id: string; path: string };
type QueueMode = "upsert" | "insert";

export const COPY_CANCELED_CODE = "copy-canceled";

function copyCanceledError(): Error {
  const err = new Error("copy canceled");
  // @ts-ignore
  err.code = COPY_CANCELED_CODE;
  return err;
}

function fileServerClientWithTimeout(
  project_id: string,
  timeout_ms?: number,
): Fileserver {
  if (!timeout_ms) return fileServerClient({ project_id });
  return conat().call<Fileserver>(`file-server.${project_id}`, {
    timeout: timeout_ms,
  });
}

function report(progress: CopyProgress | undefined, update: CopyStep) {
  progress?.(update);
}

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

function normalizeSrcPaths(src: CopySource): string[] {
  const raw = Array.isArray(src.path) ? src.path : [src.path];
  if (!raw.length) {
    throw new Error("src.path must not be empty");
  }
  const normalized = raw.map((p, idx) =>
    normalizeRelativePath(p, `src.path[${idx}]`),
  );
  return normalized;
}

async function getHostIds(
  project_ids: string[],
): Promise<Map<string, string>> {
  const { rows } = await getPool().query<{
    project_id: string;
    host_id: string | null;
  }>(
    `
      SELECT project_id, host_id
      FROM projects
      WHERE project_id = ANY($1)
    `,
    [project_ids],
  );
  const map = new Map<string, string>();
  for (const row of rows) {
    if (row.host_id) {
      map.set(row.project_id, row.host_id);
    }
  }
  for (const project_id of project_ids) {
    if (!map.has(project_id)) {
      throw new Error(`project ${project_id} has no host assigned`);
    }
  }
  return map;
}

async function assertBackupContainsPath({
  project_id,
  snapshot_id,
  path: srcPath,
  client,
}: {
  project_id: string;
  snapshot_id: string;
  path: string;
  client: Fileserver;
}): Promise<void> {
  if (!srcPath) return;
  const parent = path.posix.dirname(srcPath);
  const base = path.posix.basename(srcPath);
  const listing = await client.getBackupFiles({
    project_id,
    id: snapshot_id,
    path: parent === "." ? "" : parent,
  });
  if (!listing.some((entry) => entry.name === base)) {
    throw new Error(`path not found in backup: ${srcPath}`);
  }
}

export async function copyProjectFiles({
  src,
  dests,
  options,
  account_id,
  op_id,
  progress,
  snapshot_id,
  skip_queue = false,
  queue_mode = "upsert",
  timeout_ms = COPY_FILES_TIMEOUT_MS,
  shouldAbort,
}: {
  src: CopySource;
  dests: CopyDest[];
  options?: CopyOptions;
  account_id: string;
  op_id?: string;
  progress?: CopyProgress;
  snapshot_id?: string;
  skip_queue?: boolean;
  queue_mode?: QueueMode;
  timeout_ms?: number;
  shouldAbort?: () => Promise<boolean>;
}): Promise<{ queued: number; local: number; snapshot_id?: string }> {
  if (!account_id) {
    throw new Error("account_id is required");
  }
  if (!dests.length) {
    throw new Error("at least one destination is required");
  }

  report(progress, { step: "validate" });
  if (shouldAbort && (await shouldAbort())) {
    throw copyCanceledError();
  }

  const srcPaths = normalizeSrcPaths(src);
  if (srcPaths.length > 1 && srcPaths.some((p) => !p)) {
    throw new Error("empty src path not allowed when copying multiple paths");
  }
  if (shouldAbort && (await shouldAbort())) {
    throw copyCanceledError();
  }

  const normalizedDests = dests.map((dest, idx) => ({
    project_id: dest.project_id,
    path: normalizeRelativePath(dest.path, `dests[${idx}].path`),
  }));

  const projectIds = new Set<string>([src.project_id]);
  for (const dest of normalizedDests) {
    projectIds.add(dest.project_id);
  }
  const hostIds = await getHostIds(Array.from(projectIds));
  const srcHostId = hostIds.get(src.project_id)!;

  const localDests: CopyDest[] = [];
  const remoteDests: CopyDest[] = [];
  for (const dest of normalizedDests) {
    const destHostId = hostIds.get(dest.project_id)!;
    if (destHostId === srcHostId) {
      localDests.push(dest);
    } else {
      remoteDests.push(dest);
    }
  }

  let queuedCount = 0;
  let localCount = 0;

  if (remoteDests.length && !skip_queue) {
    if (shouldAbort && (await shouldAbort())) {
      throw copyCanceledError();
    }
    report(progress, {
      step: "backup",
      detail: { paths: srcPaths.length, destinations: remoteDests.length },
    });
    // TODO: once last_edited is reliable, allow reusing a recent backup.
    const tags = [
      "purpose=copy",
      `src_project_id=${src.project_id}`,
      ...(op_id ? [`op_id=${op_id}`] : []),
      ...srcPaths
        .filter((p) => p)
        .map((p) => `src_path=${encodeURIComponent(p)}`),
    ];
    const backupClient = fileServerClientWithTimeout(
      src.project_id,
      timeout_ms,
    );
    let createdBackup = false;
    if (!snapshot_id) {
      const backup = await backupClient.createBackup({
        project_id: src.project_id,
        limit: MAX_BACKUPS_PER_PROJECT,
        tags,
      });
      snapshot_id = backup.id;
      createdBackup = true;
    }
    if (!snapshot_id) {
      throw new Error("backup creation failed (missing snapshot id)");
    }
    if (shouldAbort && (await shouldAbort())) {
      throw copyCanceledError();
    }
    try {
      for (const srcPath of srcPaths) {
        if (shouldAbort && (await shouldAbort())) {
          throw copyCanceledError();
        }
        await assertBackupContainsPath({
          project_id: src.project_id,
          snapshot_id: snapshot_id,
          path: srcPath,
          client: backupClient,
        });
      }

      report(progress, {
        step: "queue",
        message: "queueing remote copies",
        detail: { snapshot_id, destinations: remoteDests.length },
      });
      const expiresAt = new Date(Date.now() + COPY_TTL_MS);

      for (const dest of remoteDests) {
        if (shouldAbort && (await shouldAbort())) {
          throw copyCanceledError();
        }
        if (srcPaths.length > 1) {
          for (const srcPath of srcPaths) {
            const base = path.posix.basename(srcPath);
            const destPath = normalizeRelativePath(
              path.posix.join(dest.path, base),
              "dest.path",
            );
            const inserted =
              queue_mode === "insert"
                ? await insertCopyRowIfMissing({
                    src_project_id: src.project_id,
                    src_path: srcPath,
                    dest_project_id: dest.project_id,
                    dest_path: destPath,
                    op_id,
                    snapshot_id,
                    options,
                    expires_at: expiresAt,
                  })
                : await upsertCopyRow({
                    src_project_id: src.project_id,
                    src_path: srcPath,
                    dest_project_id: dest.project_id,
                    dest_path: destPath,
                    op_id,
                    snapshot_id,
                    options,
                    expires_at: expiresAt,
                  });
            if (queue_mode === "upsert" || inserted) {
              queuedCount += 1;
            }
          }
        } else {
          const inserted =
            queue_mode === "insert"
              ? await insertCopyRowIfMissing({
                  src_project_id: src.project_id,
                  src_path: srcPaths[0],
                  dest_project_id: dest.project_id,
                  dest_path: dest.path,
                  op_id,
                  snapshot_id,
                  options,
                  expires_at: expiresAt,
                })
              : await upsertCopyRow({
                  src_project_id: src.project_id,
                  src_path: srcPaths[0],
                  dest_project_id: dest.project_id,
                  dest_path: dest.path,
                  op_id,
                  snapshot_id,
                  options,
                  expires_at: expiresAt,
                });
          if (queue_mode === "upsert" || inserted) {
            queuedCount += 1;
          }
        }
      }
      report(progress, {
        step: "queue",
        message: `queued ${queuedCount} remote copies`,
        detail: {
          snapshot_id,
          queued: queuedCount,
          local: localCount,
          total: queuedCount + localCount,
        },
      });
    } catch (err) {
      if (createdBackup && snapshot_id) {
        try {
          await backupClient.deleteBackup({
            project_id: src.project_id,
            id: snapshot_id,
          });
        } catch (cleanupErr) {
          logger.warn("copyProjectFiles: backup cleanup failed", {
            project_id: src.project_id,
            snapshot_id,
            err: `${cleanupErr}`,
          });
        }
      }
      throw err;
    }
  }

  if (localDests.length) {
    if (shouldAbort && (await shouldAbort())) {
      throw copyCanceledError();
    }
    report(progress, {
      step: "copy-local",
      detail: { count: localDests.length, paths: srcPaths.length },
    });
    const client = fileServerClientWithTimeout(
      src.project_id,
      timeout_ms,
    );
    for (const dest of localDests) {
      await client.cp({ src, dest, options });
      localCount += srcPaths.length;
    }
  }

  report(progress, { step: "done" });
  return { queued: queuedCount, local: localCount, snapshot_id };
}
