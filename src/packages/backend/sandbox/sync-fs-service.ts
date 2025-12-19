import { watch as chokidarWatch, type FSWatcher } from "chokidar";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "events";
import { dirname } from "path";
import { SyncFsWatchStore, type ExternalChange } from "./sync-fs-watch";
import { AStream } from "@cocalc/conat/sync/astream";
import { patchesStreamName } from "@cocalc/conat/sync/synctable-stream";
import { conat } from "@cocalc/backend/conat/conat";
import { client_db } from "@cocalc/util/db-schema/client-db";
import {
  createDbCodec,
  createImmerDbCodec,
  type DocCodec,
} from "@cocalc/sync/patchflow";
import { type SyncDoc } from "@cocalc/sync";
import {
  comparePatchId,
  decodePatchId,
  encodePatchId,
  legacyPatchId,
  type PatchId,
} from "patchflow";

export interface WatchEvent {
  path: string;
  type: "change" | "delete";
  change?: ExternalChange;
}

export interface WatchMeta {
  project_id?: string;
  relativePath?: string;
  string_id?: string;
  doctype?: {
    type?: string;
    patch_format?: number;
    opts?: Record<string, unknown>;
  };
}

interface WatchEntry {
  watcher: FSWatcher;
  lastHeartbeat: number;
  paths: Set<string>;
}

const HEARTBEAT_TTL = 60_000; // ms to keep a watch alive without heartbeats
const DEBOUNCE_MS = 250; // coalesce rapid events
const SUPPRESS_TTL_MS = 5_000; // suppress self-inflicted fs events briefly

type StreamInfo = {
  heads: Set<PatchId>;
  maxVersion: number;
  maxTimeMs: number;
  lastSeq?: number;
};

/**
 * Centralized filesystem watcher that:
 * - Maintains a durable snapshot of last-on-disk content (via SyncFsWatchStore).
 * - Watches directories (not per-client) and emits a single normalized event per
 *   filesystem change.
 * - Heartbeats keep a watch alive; if nobody is interested, the watch is torn down.
 *
 * Consumers can subscribe to "event" and append resulting patches to patchflow.
 */
export class SyncFsService extends EventEmitter {
  private store: SyncFsWatchStore;
  private watchers: Map<string, WatchEntry> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private metaByPath: Map<string, WatchMeta> = new Map();
  private patchWriters: Map<string, AStream<any>> = new Map();
  private streamInfo: Map<string, StreamInfo> = new Map();
  private suppressOnce: Map<string, NodeJS.Timeout> = new Map();
  private conatClient?: any;
  private readonly clientId: string;

  constructor(store?: SyncFsWatchStore) {
    super();
    this.store = store ?? new SyncFsWatchStore();
    this.clientId = this.makeClientId();
    setInterval(this.pruneStale, HEARTBEAT_TTL);
  }

  private async initPath(path: string, meta?: WatchMeta): Promise<void> {
    if (!meta?.project_id || !meta.relativePath) return;
    const string_id =
      meta.string_id ?? client_db.sha1(meta.project_id, meta.relativePath);
    const codec = this.resolveCodec(meta);
    try {
      // If we already have a snapshot of on-disk content, just diff against it.
      const existing = this.store.get(path);
      if (!existing) {
        // Fresh store entry but history may already exist in the patch stream.
        const { heads, maxVersion } = await this.getStreamHeads({
          project_id: meta.project_id,
          string_id,
        });
        if (heads.length > 0 || maxVersion > 0) {
          // Reconstruct the current document from the patch stream (respecting
          // snapshots) to avoid emitting an orphaned "initial" patch that
          // duplicates content.
          const current = await this.loadDocViaSyncDoc({
            project_id: meta.project_id,
            string_id,
            relativePath: meta.relativePath,
            doctype: meta.doctype,
          });
          if (current != null) {
            this.store.setContent(path, current);
          }
        }
      }

      const change = await this.store.handleExternalChange(
        path,
        async () => (await readFile(path, "utf8")) as string,
        false,
        codec,
      );
      if (change.patch) {
        const payload: ExternalChange = { ...change, deleted: false };
        await this.appendPatch({ ...meta, string_id }, "change", payload);
      }
    } catch (err) {
      this.emit("error", err);
    }
  }

  close(): void {
    for (const { watcher } of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    for (const writer of this.patchWriters.values()) {
      writer.close();
    }
    this.patchWriters.clear();
    this.store.close();
    this.removeAllListeners();
  }

  // Update the persisted snapshot when we know a local write/delete happened
  // via our own filesystem API. This prevents echo patches on the next fs event.
  recordLocalWrite(
    path: string,
    content: string,
    suppress: boolean = false,
  ): void {
    this.store.setContent(path, content);
    if (!suppress) return;
    if (this.suppressOnce.has(path)) {
      clearTimeout(this.suppressOnce.get(path)!);
    }
    const timer = setTimeout(() => {
      this.suppressOnce.delete(path);
    }, SUPPRESS_TTL_MS);
    this.suppressOnce.set(path, timer);
  }

  async recordLocalDelete(path: string): Promise<void> {
    let change: ExternalChange = { deleted: true, content: "", hash: "" };
    const meta = this.metaByPath.get(path);
    const codec = this.resolveCodec(meta);
    try {
      const computed = await this.store.handleExternalChange(
        path,
        async () => "",
        true,
        codec,
      );
      change = { ...computed, deleted: true };
    } catch {
      // at least do this:
      this.store.markDeleted(path);
    }
    // If we already know the meta for this path, append a delete patch immediately
    // so clients see the deletion even if the watcher event is delayed.
    if (process.env.SYNC_FS_DEBUG) {
      console.log("sync-fs recordLocalDelete", {
        path,
        hasMeta: meta != null,
      });
    }
    if (meta) {
      try {
        await this.appendPatch(meta, "delete", change);
      } catch (err) {
        this.emit("error", err);
      }
    }
  }

  /**
   * Indicate interest in a file. Ensures a directory watcher exists and is fresh.
   * If active is false, drops interest immediately. Resolves once a newly
   * created watcher has emitted "ready" so callers know the watch is armed.
   */
  async heartbeat(
    path: string,
    active: boolean = true,
    meta?: WatchMeta,
  ): Promise<void> {
    const dir = dirname(path);
    const existing = this.watchers.get(dir);
    if (active) {
      if (meta) {
        // Record metadata
        this.metaByPath.set(path, meta);
      }

      if (!existing?.paths.has(path)) {
        await this.initPath(path, meta);
      }

      if (existing) {
        existing.lastHeartbeat = Date.now();
        existing.paths.add(path);
        return;
      }
      const watcher = chokidarWatch(dir, {
        depth: 0,
        ignoreInitial: true,
        awaitWriteFinish: {
          stabilityThreshold: 200,
          pollInterval: 100,
        },
      });
      this.watchers.set(dir, {
        watcher,
        lastHeartbeat: Date.now(),
        paths: new Set([path]),
      });

      // Wait until the watcher is ready before returning so callers know the
      // backend is actively watching.
      const ready = new Promise<void>((resolve, reject) => {
        let settled = false;
        const settle = (fn: () => void) => {
          if (settled) return;
          settled = true;
          fn();
        };
        watcher.once("ready", () => settle(resolve));
        watcher.once("error", (err) => settle(() => reject(err)));
      });
      if (process.env.SYNC_FS_DEBUG) {
        console.log("sync-fs heartbeat: start watcher", { dir, path });
      }

      watcher.on("add", (p) => this.onFsEvent(dir, p, "add"));
      watcher.on("change", (p) => this.onFsEvent(dir, p, "change"));
      watcher.on("unlink", (p) => this.onFsEvent(dir, p, "unlink"));
      watcher.on("error", (err) => {
        this.emit("error", err);
      });

      await ready;
    } else {
      if (!existing) return;
      existing.paths.delete(path);
      this.metaByPath.delete(path);
      if (existing.paths.size === 0) {
        this.closeEntry(dir);
      }
    }
  }

  private onFsEvent(
    dir: string,
    path: string,
    event: "add" | "change" | "unlink",
  ): void {
    const entry = this.watchers.get(dir);
    if (!entry || !entry.paths.has(path)) return;
    // Debounce per path to avoid rapid duplicate events
    if (this.debounceTimers.has(path)) {
      clearTimeout(this.debounceTimers.get(path)!);
    }
    const timer = setTimeout(async () => {
      this.debounceTimers.delete(path);
      const meta = this.metaByPath.get(path);
      const codec = this.resolveCodec(meta);
      if (event === "unlink") {
        try {
          const change = await this.store.handleExternalChange(
            path,
            async () => "",
            true,
            codec,
          );
          const payload = { ...change, deleted: true };
          this.emitEvent({ path, type: "delete", change: payload });
          if (meta) {
            await this.appendPatch(meta, "delete", payload);
          }
        } catch (err) {
          this.emit("error", err);
        }
        return;
      }
      // add/change
      try {
        if (this.suppressOnce.has(path)) {
          clearTimeout(this.suppressOnce.get(path)!);
          this.suppressOnce.delete(path);
          return;
        }
        const change = await this.store.handleExternalChange(
          path,
          async () => {
            return (await readFile(path, "utf8")) as string;
          },
          false,
          codec,
        );
        if (!change.deleted && change.patch == null) {
          return;
        }
        this.emitEvent({ path, type: "change", change });
        if (meta) {
          await this.appendPatch(meta, "change", change);
        }
      } catch (err) {
        this.emit("error", err);
      }
    }, DEBOUNCE_MS);
    this.debounceTimers.set(path, timer);
  }

  private emitEvent(evt: WatchEvent): void {
    this.emit("event", evt);
  }

  // Reconstruct the current document value from the patch stream to seed the
  // snapshot store without emitting a bogus "initial" patch.
  private async loadDocViaSyncDoc({
    project_id,
    string_id,
    relativePath,
    doctype,
  }: {
    project_id: string;
    string_id: string;
    relativePath: string;
    doctype?: WatchMeta["doctype"];
  }): Promise<string | undefined> {
    const client = this.getConatClient();

    const commonOpts = {
      project_id,
      path: relativePath,
      string_id,
      // important to avoid any possible feedback loop
      noSaveToDisk: true,
      noAutosave: true,
      firstReadLockTimeout: 1,
    };

    const toArray = (val: unknown): string[] | undefined => {
      if (Array.isArray(val)) return val;
      if (val instanceof Set) return Array.from(val);
      return undefined;
    };

    const format = doctype?.patch_format;
    const opts = (doctype?.opts ?? {}) as Record<string, unknown>;
    const primaryKeys =
      toArray(
        (opts as { primary_keys?: unknown; primaryKeys?: unknown })
          .primary_keys,
      ) ??
      toArray(
        (opts as { primary_keys?: unknown; primaryKeys?: unknown }).primaryKeys,
      ) ??
      [];
    const stringCols =
      toArray(
        (opts as { string_cols?: unknown; stringCols?: unknown }).string_cols,
      ) ??
      toArray(
        (opts as { string_cols?: unknown; stringCols?: unknown }).stringCols,
      ) ??
      [];

    let doc: SyncDoc | undefined;
    try {
      if (format === 1 && primaryKeys.length > 0) {
        doc = client.sync.db({
          ...commonOpts,
          primary_keys: primaryKeys,
          string_cols: stringCols,
        });
      } else {
        doc = client.sync.string(commonOpts);
      }
      await new Promise<void>((resolve, reject) => {
        doc!.once("ready", () => resolve());
        doc!.once("error", (err) => reject(err));
      });
      const value = doc?.to_str();
      doc?.close?.();
      return value;
    } catch (err) {
      try {
        doc?.close?.();
      } catch {
        // ignore close errors
      }
      this.emit("error", err as Error);
    }

    return;
  }

  // Choose an appropriate codec for structured documents so we can compute
  // patches without falling back to text diffing.
  private resolveCodec(meta?: WatchMeta): DocCodec | undefined {
    const toArray = (val: unknown): string[] | undefined => {
      if (Array.isArray(val)) return val;
      if (val instanceof Set) return Array.from(val);
      return undefined;
    };
    const format = meta?.doctype?.patch_format;
    if (format !== 1) return;
    const opts = (meta?.doctype?.opts ?? {}) as Record<string, unknown>;
    const primaryKeys = toArray(
      (opts as any).primary_keys ?? (opts as any).primaryKeys,
    );
    const stringCols =
      toArray((opts as any).string_cols ?? (opts as any).stringCols) ?? [];
    if (!primaryKeys || primaryKeys.length === 0) {
      return;
    }
    const type = meta?.doctype?.type ?? "";
    if (typeof type === "string" && type.toLowerCase().includes("immer")) {
      return createImmerDbCodec({
        primaryKeys,
        stringCols,
      });
    }
    return createDbCodec({
      primaryKeys,
      stringCols,
    });
  }

  private pruneStale = (): void => {
    const now = Date.now();
    for (const [dir, entry] of this.watchers.entries()) {
      if (entry.paths.size === 0 || now - entry.lastHeartbeat > HEARTBEAT_TTL) {
        this.closeEntry(dir);
      }
    }
  };

  private closeEntry(dir: string): void {
    const entry = this.watchers.get(dir);
    if (!entry) return;
    for (const p of entry.paths) {
      this.metaByPath.delete(p);
    }
    entry.watcher.close();
    this.watchers.delete(dir);
  }

  private async appendPatch(
    meta: WatchMeta,
    type: "change" | "delete",
    change: ExternalChange,
  ): Promise<void> {
    if (!meta.project_id) return;
    const relativePath = meta.relativePath;
    if (!relativePath) return;
    if (process.env.SYNC_FS_DEBUG) {
      console.log("sync-fs appendPatch start", {
        relativePath,
        type,
      });
    }
    const string_id =
      meta.string_id ?? client_db.sha1(meta.project_id, relativePath);
    const { heads, maxVersion, maxTimeMs } = await this.getStreamHeads({
      project_id: meta.project_id,
      string_id,
    });
    const parents = heads;
    const parentMaxMs =
      parents.length > 0
        ? Math.max(...parents.map((t) => this.timeMs(t)))
        : maxTimeMs;
    const timeMs = Math.max(Date.now(), parentMaxMs + 1);
    const time = encodePatchId(timeMs, this.clientId);
    const version = Math.max(maxVersion, 0) + 1;
    const obj: any = {
      string_id,
      project_id: meta.project_id,
      path: relativePath,
      time,
      wall: timeMs,
      user_id: 0,
      is_snapshot: false,
      parents,
      version,
      file: true,
    };
    if (type === "delete") {
      obj.meta = { deleted: true };
      obj.patch = JSON.stringify(change.patch ?? []);
    } else {
      obj.meta = change.deleted ? { deleted: true } : undefined;
      obj.patch = JSON.stringify(change.patch ?? []);
    }
    if (meta.doctype?.patch_format) {
      obj.format = meta.doctype.patch_format;
    }
    try {
      const writer = await this.getPatchWriter({
        project_id: meta.project_id,
        string_id,
      });
      if (process.env.SYNC_FS_DEBUG) {
        console.log("sync-fs appendPatch publish", {
          type,
          parents,
          time,
          version,
        });
      }
      const { seq } = await writer.publish(obj);
      this.store.setFsHead({ string_id, time, version });
      this.updateStreamInfo(string_id, obj, seq);
      if (process.env.SYNC_FS_DEBUG) {
        console.log("sync-fs appendPatch", {
          path: meta.relativePath,
          type,
          time,
          version,
          parents,
        });
      }
    } catch (err) {
      if (process.env.SYNC_FS_DEBUG) {
        console.log("sync-fs appendPatch error", err);
      }
      this.emit("error", err);
    }
  }

  private async getPatchWriter({
    project_id,
    string_id,
  }: {
    project_id: string;
    string_id: string;
  }): Promise<AStream<any>> {
    const cached = this.patchWriters.get(string_id);
    if (cached) return cached;
    const writer = new AStream({
      name: patchesStreamName({ string_id }),
      project_id,
      client: this.getConatClient(),
      noInventory: true,
      noAutosave: true,
    });
    this.patchWriters.set(string_id, writer);
    return writer;
  }

  private updateStreamInfo(string_id: string, patch: any, seq: number): void {
    const persisted = this.store.getFsHead(string_id);
    let info: StreamInfo =
      this.streamInfo.get(string_id) ??
      {
        heads: new Set<PatchId>(
          (persisted?.heads ?? [])
            .map((h) => this.normalizePatchId(h))
            .filter((h): h is PatchId => !!h),
        ),
        maxVersion: persisted?.version ?? 0,
        maxTimeMs: (() => {
          const t = this.normalizePatchId((persisted as any)?.time);
          return t ? this.timeMs(t) : 0;
        })(),
        lastSeq: persisted?.lastSeq,
      };
    info = {
      heads: new Set<PatchId>(
        [...info.heads]
          .map((h) => this.normalizePatchId(h))
          .filter((h): h is PatchId => !!h),
      ),
      maxVersion: info.maxVersion ?? 0,
      maxTimeMs:
        info.maxTimeMs ??
        this.timeMs(this.normalizePatchId((persisted as any)?.time)),
      lastSeq: info.lastSeq,
    };
    info.lastSeq = seq;
    const parentIds = Array.isArray(patch.parents)
      ? patch.parents
          .map((t: any) => this.normalizePatchId(t))
          .filter((t): t is PatchId => !!t)
      : [];
    for (const t of parentIds) info.heads.delete(t);
    const tId = this.normalizePatchId(patch.time);
    if (tId) {
      info.heads.add(tId);
      info.maxTimeMs = Math.max(info.maxTimeMs, this.timeMs(tId));
    }
    if (typeof patch.version === "number") {
      info.maxVersion = Math.max(info.maxVersion, patch.version);
    }
    const latest =
      [...info.heads].sort(comparePatchId).pop() ??
      encodePatchId(info.maxTimeMs || Date.now(), this.clientId);
    this.streamInfo.set(string_id, info);
    this.store.setFsHead({
      string_id,
      time: latest,
      version: info.maxVersion,
      heads: [...info.heads],
      lastSeq: info.lastSeq,
    });
  }

  private getConatClient() {
    if (!this.conatClient) {
      this.conatClient = conat();
    }
    return this.conatClient;
  }

  private makeClientId(): string {
    try {
      const { randomBytes } = require("node:crypto") as typeof import("node:crypto");
      const buf = randomBytes(10);
      return buf.toString("base64url");
    } catch (err) {
      if (process.env.SYNC_FS_DEBUG) {
        console.warn(
          "sync-fs: crypto random unavailable; using weak randomness for clientId",
          err,
        );
      }
      return `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
    }
  }

  private normalizePatchId(id: any): PatchId | undefined {
    if (typeof id === "string") return id;
    if (typeof id === "number" && Number.isFinite(id)) {
      return legacyPatchId(id);
    }
    return undefined;
  }

  private timeMs(id?: PatchId): number {
    if (!id) return 0;
    try {
      return decodePatchId(id).timeMs;
    } catch {
      return 0;
    }
  }

  private async getStreamHeads({
    project_id,
    string_id,
  }: {
    project_id: string;
    string_id: string;
  }): Promise<{
    heads: PatchId[];
    maxVersion: number;
    maxTimeMs: number;
  }> {
    const writer = await this.getPatchWriter({ project_id, string_id });
    const persisted = this.store.getFsHead(string_id);
    let info: StreamInfo =
      this.streamInfo.get(string_id) ??
      {
        heads: new Set<PatchId>(
          (persisted?.heads ?? [])
            .map((h) => this.normalizePatchId(h))
            .filter((h): h is PatchId => !!h),
        ),
        maxVersion: persisted?.version ?? 0,
        maxTimeMs: (() => {
          const t = this.normalizePatchId((persisted as any)?.time);
          return t ? this.timeMs(t) : 0;
        })(),
        lastSeq: persisted?.lastSeq,
      };
    // Normalize legacy entries that may still be in-memory.
    info = {
      heads: new Set<PatchId>(
        [...info.heads]
          .map((h) => this.normalizePatchId(h))
          .filter((h): h is PatchId => !!h),
      ),
      maxVersion: info.maxVersion ?? 0,
      maxTimeMs:
        info.maxTimeMs ??
        this.timeMs(this.normalizePatchId((persisted as any)?.time)),
      lastSeq: info.lastSeq,
    };
    // If we don't have any heads persisted yet, rebuild from the beginning so
    // we don't publish an orphaned head with empty parents.
    const start_seq =
      info.heads.size === 0 || info.lastSeq == null
        ? undefined
        : info.lastSeq + 1;
    if (process.env.SYNC_FS_DEBUG) {
      console.log("sync-fs getStreamHeads start", { string_id, start_seq });
    }
    try {
      for await (const { mesg, seq } of writer.getAll({
        timeout: 15000,
        start_seq,
      })) {
        const p: any = mesg;
        if (typeof seq === "number") info.lastSeq = seq;
        const parentIds = Array.isArray(p.parents)
          ? p.parents
              .map((t: any) => this.normalizePatchId(t))
              .filter((t): t is PatchId => !!t)
          : [];
        for (const t of parentIds) info.heads.delete(t);
        const tId = this.normalizePatchId(p.time);
        if (tId) {
          info.heads.add(tId);
          info.maxTimeMs = Math.max(info.maxTimeMs, this.timeMs(tId));
        }
        if (typeof p.version === "number") {
          info.maxVersion = Math.max(info.maxVersion, p.version);
        }
      }
    } catch (err) {
      if (process.env.SYNC_FS_DEBUG) {
        console.log("sync-fs getStreamHeads error", err);
      }
      // fall through with whatever we gathered
    }
    // If we still have no heads but saw versions, fallback to full replay once.
    if (
      info.heads.size === 0 &&
      info.maxVersion > 0 &&
      start_seq !== undefined
    ) {
      if (process.env.SYNC_FS_DEBUG) {
        console.log("sync-fs getStreamHeads retry from start", { string_id });
      }
      return this.getStreamHeads({ project_id, string_id });
    }
    if (process.env.SYNC_FS_DEBUG) {
      console.log("sync-fs getStreamHeads done", {
        string_id,
        heads: info.heads.size,
        maxVersion: info.maxVersion,
      });
    }
    this.streamInfo.set(string_id, info);
    const latest =
      [...info.heads].sort(comparePatchId).pop() ??
      encodePatchId(info.maxTimeMs || Date.now(), this.clientId);
    this.store.setFsHead({
      string_id,
      time: latest,
      version: info.maxVersion,
      heads: [...info.heads],
      lastSeq: info.lastSeq,
    });
    return {
      heads: [...info.heads],
      maxVersion: info.maxVersion,
      maxTimeMs: info.maxTimeMs,
    };
  }
}
