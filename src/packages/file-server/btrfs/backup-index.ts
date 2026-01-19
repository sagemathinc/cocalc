import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { dirname, join, posix } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { data } from "@cocalc/backend/data";
import getLogger from "@cocalc/backend/logger";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { SandboxedFilesystem } from "@cocalc/backend/sandbox";

const logger = getLogger("file-server:btrfs:backup-index");

export const BACKUP_INDEX_LABEL_PREFIX = "backup-id=";

export function backupIndexHost(projectId: string) {
  return `project-${projectId}-index`;
}

export function backupIndexDir(projectId: string) {
  return join(data, "backup-index", projectId);
}

export function backupIndexFileName(backupId: string) {
  return `backup-${backupId}.sqlite`;
}

export function backupIndexFilePath(projectId: string, backupId: string) {
  return join(backupIndexDir(projectId), backupIndexFileName(backupId));
}

export interface BackupIndexMeta {
  backupId: string;
  backupTime: Date;
  snapshotId?: string;
}

export async function buildBackupIndex({
  snapshotPath,
  outputPath,
  meta,
}: {
  snapshotPath: string;
  outputPath: string;
  meta: BackupIndexMeta;
}): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  if (await exists(outputPath)) {
    await rm(outputPath, { force: true });
  }
  const db = new DatabaseSync(outputPath);
  try {
    db.exec(`
      PRAGMA journal_mode=OFF;
      PRAGMA synchronous=OFF;
      PRAGMA temp_store=MEMORY;
      CREATE TABLE meta (
        key TEXT PRIMARY KEY,
        value TEXT
      );
      CREATE TABLE files (
        path TEXT PRIMARY KEY,
        parent TEXT,
        name TEXT,
        type TEXT,
        size INTEGER,
        mtime INTEGER,
        mode INTEGER
      );
      CREATE INDEX files_parent ON files(parent);
      CREATE INDEX files_name ON files(name);
    `);

    const insertFile = db.prepare(
      "INSERT INTO files (path, parent, name, type, size, mtime, mode) VALUES (?, ?, ?, ?, ?, ?, ?)",
    );

    db.exec("BEGIN");
    await scanSnapshot(snapshotPath, (entry) => {
      insertFile.run(
        entry.path,
        entry.parent,
        entry.name,
        entry.type,
        entry.size,
        entry.mtime,
        entry.mode,
      );
    });
    db.exec("COMMIT");

    const insertMeta = db.prepare(
      "INSERT INTO meta (key, value) VALUES (?, ?)",
    );
    insertMeta.run("backup_id", meta.backupId);
    insertMeta.run("backup_time", meta.backupTime.toISOString());
    if (meta.snapshotId) {
      insertMeta.run("snapshot_id", meta.snapshotId);
    }
    insertMeta.run("version", "1");

    db.exec("ANALYZE");
    db.exec("VACUUM");
  } finally {
    db.close();
  }
}

export async function uploadBackupIndex({
  projectId,
  backupId,
  repo,
  timeout = 30 * 60 * 1000,
}: {
  projectId: string;
  backupId: string;
  repo: string;
  timeout?: number;
}): Promise<void> {
  const dir = backupIndexDir(projectId);
  const fileName = backupIndexFileName(backupId);
  const indexFs = new SandboxedFilesystem(dir, {
    host: backupIndexHost(projectId),
    rusticRepo: repo,
  });
  await indexFs.rustic(
    [
      "backup",
      "-x",
      "--json",
      "--label",
      `${BACKUP_INDEX_LABEL_PREFIX}${backupId}`,
      fileName,
    ],
    { timeout, cwd: "." },
  );
}

interface BackupIndexEntry {
  path: string;
  parent: string;
  name: string;
  type: string;
  size: number;
  mtime: number;
  mode: number;
}

async function scanSnapshot(
  snapshotPath: string,
  onEntry: (entry: BackupIndexEntry) => void,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      "find",
      [".", "-printf", "%y\0%s\0%T@\0%m\0%p\0"],
      {
        cwd: snapshotPath,
        env: { ...process.env, LC_ALL: "C.UTF-8", LANG: "C.UTF-8" },
      },
    );
    let pending = "";
    let fields: string[] = [];
    const flush = (token: string) => {
      fields.push(token);
      if (fields.length < 5) return;
      const [type, sizeRaw, mtimeRaw, modeRaw, pathRaw] = fields;
      fields = [];
      let path = pathRaw;
      if (path.startsWith("./")) {
        path = path.slice(2);
      } else if (path === ".") {
        path = "";
      }
      if (!path) return;
      const parent = path.includes("/")
        ? posix.dirname(path).replace(/^\.$/, "")
        : "";
      const name = posix.basename(path);
      const size = Number(sizeRaw) || 0;
      const mtime = Math.floor(Number(mtimeRaw) || 0);
      const mode = parseInt(modeRaw, 10) || 0;
      onEntry({ path, parent, name, type, size, mtime, mode });
    };

    child.stdout.on("data", (chunk) => {
      const data = pending + chunk.toString("utf8");
      const parts = data.split("\0");
      pending = parts.pop() ?? "";
      for (const token of parts) {
        flush(token);
      }
    });
    child.stderr.on("data", (chunk) => {
      const message = chunk.toString("utf8").trim();
      if (message) {
        logger.debug("backup index find stderr", message);
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (pending) {
        flush(pending);
      }
      if (code && code !== 0) {
        reject(new Error(`find exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });
}
