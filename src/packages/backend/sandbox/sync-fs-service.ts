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
  private conatClient = conat();

  constructor(store?: SyncFsWatchStore) {
    super();
    this.store = store ?? new SyncFsWatchStore();
    setInterval(this.pruneStale, HEARTBEAT_TTL);
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
  recordLocalWrite(path: string, content: string): void {
    this.store.setContent(path, content);
  }

  recordLocalDelete(path: string): void {
    this.store.markDeleted(path);
  }

  /**
   * Indicate interest in a file. Ensures a directory watcher exists and is fresh.
   * If active is false, drops interest immediately.
   */
  heartbeat(path: string, active: boolean = true, meta?: WatchMeta): void {
    const dir = dirname(path);
    const existing = this.watchers.get(dir);
    if (active) {
      if (meta) {
        this.metaByPath.set(path, meta);
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

      watcher.on("add", (p) => this.onFsEvent(dir, p, "add"));
      watcher.on("change", (p) => this.onFsEvent(dir, p, "change"));
      watcher.on("unlink", (p) => this.onFsEvent(dir, p, "unlink"));
      watcher.on("error", (err) => {
        this.emit("error", err);
      });
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
        this.store.markDeleted(path);
        const change = { deleted: true, content: "", hash: "" };
        this.emitEvent({ path, type: "delete", change });
        if (meta) {
          await this.appendPatch(meta, "delete", change);
        }
        return;
        }
      // add/change
      try {
        const change = await this.store.handleExternalChange(path, async () => {
          return (await readFile(path, "utf8")) as string;
        });
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
    const string_id =
      meta.string_id ?? client_db.sha1(meta.project_id, relativePath);
    const { heads, maxVersion } = await this.getStreamHeads({
      project_id: meta.project_id,
      string_id,
    });
    const fsHead = this.store.getFsHead(string_id);
    const parents =
      heads.length > 0 ? heads : fsHead ? [fsHead.time] : [];
    const time = Math.max(Date.now(), (fsHead?.time ?? 0) + 1);
    const version = Math.max(maxVersion, fsHead?.version ?? 0) + 1;
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
      obj.patch = "[]";
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
      await writer.publish(obj);
      this.store.setFsHead({ string_id, time, version });
    } catch (err) {
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
      client: this.conatClient,
      noInventory: true,
      noAutosave: true,
    });
    this.patchWriters.set(string_id, writer);
    return writer;
  }

  private async getStreamHeads({
    project_id,
    string_id,
  }: {
    project_id: string;
    string_id: string;
  }): Promise<{ heads: number[]; maxVersion: number }> {
    const writer = await this.getPatchWriter({ project_id, string_id });
    const parentSet = new Set<number>();
    const times: number[] = [];
    let maxVersion = 0;
    // [ ] TODO: this is NOT efficient -- just need to pass {start_seq} to getAll,
    // based on last sequence number we got when writing to the patchWriter.
    try {
      for await (const { mesg } of writer.getAll()) {
        const p: any = mesg;
        if (p.time != null) times.push(p.time);
        if (Array.isArray(p.parents)) {
          for (const t of p.parents) parentSet.add(t);
        }
        if (typeof p.version === "number") {
          maxVersion = Math.max(maxVersion, p.version);
        }
      }
    } catch {
      // fall through with whatever we gathered
    }
    const heads = times.filter((t) => !parentSet.has(t));
    return { heads, maxVersion };
  }
}
