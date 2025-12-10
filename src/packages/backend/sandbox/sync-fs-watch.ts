/**
 * Backend-only helper for watching many files and emitting minimal patches.
 *
 * Context:
 * - The frontend no longer owns filesystem watching; a single backend watcher
 *   avoids duplicate reloads and inconsistent merges across clients.
 * - Each path keeps a durable last-on-disk snapshot (SQLite) so we can diff
 *   external edits (e.g., vi/git/rsync) without replaying the full patch
 *   history or holding large blobs in memory.
 * - When a directory watcher fires, the backend loads the file once, diffs
 *   against the stored snapshot, and can append a patchflow patch (or a
 *   deleted marker) using a reserved userId. Clients converge via patchflow
 *   instead of every client reloading from disk.
 * - Filesystem writes done through the file-server can update the stored
 *   snapshot directly, so we do not depend on file events that may be dropped.
 *
 * This module only persists and computes diffs; wiring it to chokidar/file
 * events and patchflow emission happens in higher-level watcher code.
 */
import { createHash } from "node:crypto";
import { unlinkSync } from "node:fs";
import { DatabaseSync as Database } from "node:sqlite";
import { DiffMatchPatch, compressPatch } from "@cocalc/util/dmp";
import { tmpNameSync } from "tmp-promise";

const dmp = new DiffMatchPatch({
  diffTimeout: 0.5,
});

export interface WatchState {
  path: string;
  content: string;
  hash: string;
  deleted: boolean;
  updatedAt: number;
}

export interface ExternalChange {
  patch?: ReturnType<typeof compressPatch>;
  content: string;
  hash: string;
  deleted: boolean;
}

export interface FsHead {
  string_id: string;
  time: number;
  version: number;
}

/**
 * Lightweight backend-only helper that tracks on-disk content for many files
 * and computes patches when the filesystem changes behind our back.
 *
 * - Persists the last known on-disk contents in a sqlite database so we can
 *   diff against the previous version without replaying the full patch stream.
 * - Intended to be driven by a single backend watcher; frontends no longer
 *   need to watch the filesystem directly.
 */
export class SyncFsWatchStore {
  private db: Database;
  private dbPath: string;
  private cleanupDb: boolean;

  constructor(dbPath?: string) {
    this.dbPath = dbPath ?? tmpNameSync({ prefix: "sync-fs-", postfix: ".db" });
    this.cleanupDb = dbPath == null;
    this.db = new Database(this.dbPath);
    this.init();
  }

  close(): void {
    this.db?.close();
    if (this.cleanupDb) {
      try {
        unlinkSync(this.dbPath);
      } catch {
        // ignore cleanup failures for tmp files
      }
    }
  }

  private init(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        hash TEXT NOT NULL,
        deleted INTEGER NOT NULL DEFAULT 0,
        updatedAt INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS fs_heads (
        string_id TEXT PRIMARY KEY,
        time INTEGER NOT NULL,
        version INTEGER NOT NULL
      );
    `);
  }

  get(path: string): WatchState | undefined {
    const row = this.db
      .prepare(
        "SELECT path, content, hash, deleted, updatedAt FROM files WHERE path = ?",
      )
      .get(path) as WatchState | undefined;
    if (!row) return;
    return {
      ...row,
      deleted: !!row.deleted,
    };
  }

  setContent(path: string, content: string): void {
    const hash = this.sha(content);
    const now = Date.now();
    this.db
      .prepare(
        `
        INSERT INTO files(path, content, hash, deleted, updatedAt)
        VALUES(?, ?, ?, 0, ?)
        ON CONFLICT(path) DO UPDATE SET
          content=excluded.content,
          hash=excluded.hash,
          deleted=0,
          updatedAt=excluded.updatedAt;
      `,
      )
      .run(path, content, hash, now);
  }

  markDeleted(path: string): void {
    const now = Date.now();
    this.db
      .prepare(
        `
        INSERT INTO files(path, content, hash, deleted, updatedAt)
        VALUES(?, '', '', 1, ?)
        ON CONFLICT(path) DO UPDATE SET
          content='',
          hash='',
          deleted=1,
          updatedAt=excluded.updatedAt;
      `,
      )
      .run(path, now);
  }

  /**
   * Compute a patch from the last known on-disk content to the current content.
   * Updates the stored snapshot and returns both the new content and the patch.
   */
  async handleExternalChange(
    path: string,
    loader: () => Promise<string>,
  ): Promise<ExternalChange> {
    const current = await loader();
    const currentHash = this.sha(current);
    const prev = this.get(path);
    if (prev && prev.hash === currentHash && !prev.deleted) {
      return { content: current, hash: currentHash, deleted: false };
    }

    const base = prev?.content ?? "";
    let patch: ReturnType<typeof compressPatch> | undefined;
    try {
      patch = compressPatch(dmp.patch_make(base, current));
    } catch {
      patch = undefined;
    }

    this.setContent(path, current);
    return { patch, content: current, hash: currentHash, deleted: false };
  }

  private sha(content: string): string {
    return createHash("sha256").update(content, "utf8").digest("hex");
  }

  getFsHead(string_id: string): FsHead | undefined {
    const row = this.db
      .prepare("SELECT string_id, time, version FROM fs_heads WHERE string_id = ?")
      .get(string_id) as FsHead | undefined;
    return row;
  }

  setFsHead(head: FsHead): void {
    this.db
      .prepare(
        `
        INSERT INTO fs_heads(string_id, time, version)
        VALUES(?, ?, ?)
        ON CONFLICT(string_id) DO UPDATE SET
          time=excluded.time,
          version=excluded.version;
      `,
      )
      .run(head.string_id, head.time, head.version);
  }
}
