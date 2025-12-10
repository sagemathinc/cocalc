import { watch as chokidarWatch, type FSWatcher } from "chokidar";
import { readFile } from "node:fs/promises";
import { EventEmitter } from "events";
import { dirname } from "path";
import { SyncFsWatchStore, type ExternalChange } from "./sync-fs-watch";

export interface WatchEvent {
  path: string;
  type: "change" | "delete";
  change?: ExternalChange;
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
    this.store.close();
    this.removeAllListeners();
  }

  /**
   * Indicate interest in a file. Ensures a directory watcher exists and is fresh.
   * If active is false, drops interest immediately.
   */
  heartbeat(path: string, active: boolean = true): void {
    const dir = dirname(path);
    const existing = this.watchers.get(dir);
    if (active) {
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
      if (event === "unlink") {
        this.store.markDeleted(path);
        this.emitEvent({ path, type: "delete", change: { deleted: true, content: "", hash: "" } });
        return;
        }
      // add/change
      try {
        const change = await this.store.handleExternalChange(path, async () => {
          return (await readFile(path, "utf8")) as string;
        });
        this.emitEvent({ path, type: "change", change });
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
    entry.watcher.close();
    this.watchers.delete(dir);
  }
}
