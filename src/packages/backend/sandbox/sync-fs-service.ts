import { watch as chokidarWatch, type FSWatcher } from "chokidar";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "events";
import { dirname } from "path";
import { SyncFsWatchStore, type ExternalChange } from "./sync-fs-watch";
import { AStream } from "@cocalc/conat/sync/astream";
import { patchesStreamName } from "@cocalc/conat/sync/synctable-stream";
import { conat } from "@cocalc/backend/conat/conat";
import { client_db } from "@cocalc/util/db-schema/client-db";

export interface WatchEvent {
  path: string;
  type: "change" | "delete";
  change?: ExternalChange;
}

export interface WatchMeta {
  project_id?: string;
  relativePath?: string;
  string_id?: string;
  doctype?: any;
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
  heads: Set<number>;
  maxVersion: number;
  maxTime: number;
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

  constructor(store?: SyncFsWatchStore) {
    super();
    this.store = store ?? new SyncFsWatchStore();
    setInterval(this.pruneStale, HEARTBEAT_TTL);
  }

  private async initPath(path: string, meta?: WatchMeta): Promise<void> {
    if (!meta?.project_id || !meta.relativePath) return;
    const string_id =
      meta.string_id ?? client_db.sha1(meta.project_id, meta.relativePath);
    try {
      const change = await this.store.handleExternalChange(
        path,
        async () => (await readFile(path, "utf8")) as string,
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
    try {
      const computed = await this.store.handleExternalChange(
        path,
        async () => "",
        true,
      );
      change = { ...computed, deleted: true };
    } catch {
      // at least do this:
      this.store.markDeleted(path);
    }
    // If we already know the meta for this path, append a delete patch immediately
    // so clients see the deletion even if the watcher event is delayed.
    const meta = this.metaByPath.get(path);
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
      if (event === "unlink") {
        try {
          const change = await this.store.handleExternalChange(
            path,
            async () => "",
            true,
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
        const change = await this.store.handleExternalChange(path, async () => {
          return (await readFile(path, "utf8")) as string;
        });
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
    const { heads, maxVersion, maxTime } = await this.getStreamHeads({
      project_id: meta.project_id,
      string_id,
    });
    const parents = heads;
    const parentMax = parents.length > 0 ? Math.max(...parents) : maxTime;
    const time = Math.max(Date.now(), parentMax + 1);
    const version = Math.max(maxVersion, 0) + 1;
    const obj: any = {
      string_id,
      project_id: meta.project_id,
      path: relativePath,
      time,
      wall: time,
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
    const info: StreamInfo = this.streamInfo.get(string_id) ?? {
      heads: new Set<number>(persisted?.heads ?? []),
      maxVersion: persisted?.version ?? 0,
      maxTime: persisted?.time ?? 0,
      lastSeq: persisted?.lastSeq,
    };
    info.lastSeq = seq;
    if (Array.isArray(patch.parents)) {
      for (const t of patch.parents) info.heads.delete(t);
    }
    if (typeof patch.time === "number") {
      info.heads.add(patch.time);
      info.maxTime = Math.max(info.maxTime, patch.time);
    }
    if (typeof patch.version === "number") {
      info.maxVersion = Math.max(info.maxVersion, patch.version);
    }
    this.streamInfo.set(string_id, info);
    this.store.setFsHead({
      string_id,
      time: info.maxTime,
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

  private async getStreamHeads({
    project_id,
    string_id,
  }: {
    project_id: string;
    string_id: string;
  }): Promise<{ heads: number[]; maxVersion: number; maxTime: number }> {
    const writer = await this.getPatchWriter({ project_id, string_id });
    const persisted = this.store.getFsHead(string_id);
    const info: StreamInfo = this.streamInfo.get(string_id) ?? {
      heads: new Set<number>(persisted?.heads ?? []),
      maxVersion: persisted?.version ?? 0,
      maxTime: persisted?.time ?? 0,
      lastSeq: persisted?.lastSeq,
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
        if (Array.isArray(p.parents)) {
          for (const t of p.parents) info.heads.delete(t);
        }
        if (typeof p.time === "number") {
          info.heads.add(p.time);
          info.maxTime = Math.max(info.maxTime, p.time);
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
    this.store.setFsHead({
      string_id,
      time: info.maxTime,
      version: info.maxVersion,
      heads: [...info.heads],
      lastSeq: info.lastSeq,
    });
    return {
      heads: [...info.heads],
      maxVersion: info.maxVersion,
      maxTime: info.maxTime,
    };
  }
}
