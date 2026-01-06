/**
 * Lightweight manager for chat SyncDB instances.
 *
 * - Provides createChatSyncDB with sane defaults for chats.
 * - Maintains a ref-counted pool so a given project/path SyncDB is opened only once
 *   in this process, and reused across turns.
 * - Delays closing for a short interval to keep the connection warm, but cancels
 *   a pending close immediately if a new acquire arrives (avoids long stalls).
 */
import type { Client as ConatClient } from "@cocalc/conat/core/client";
import {
  immerdb,
  type ImmerDBOptions,
  type ImmerDB,
} from "@cocalc/conat/sync-doc/immer-db";
import { RefcountLeaseManager } from "@cocalc/util/refcount/lease";
import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("chat:server");

export const CHAT_PRIMARY_KEYS = ["date", "sender_id", "event"];
export const CHAT_STRING_COLS = ["input"];

export interface CreateChatSyncDBOptions
  extends Omit<
    ImmerDBOptions,
    "primary_keys" | "path" | "project_id" | "client"
  > {
  client: ConatClient;
  project_id: string;
  path: string;
}

export function createChatSyncDB(opts: CreateChatSyncDBOptions): ImmerDB {
  const {
    client,
    project_id,
    path,
    change_throttle,
    patch_interval,
    string_cols,
    cursors,
    persistent,
    ...rest
  } = opts;

  const options: ImmerDBOptions = {
    ...rest,
    client,
    project_id,
    path,
    primary_keys: CHAT_PRIMARY_KEYS,
    string_cols: string_cols ?? CHAT_STRING_COLS,
    change_throttle: change_throttle ?? 50,
    patch_interval: patch_interval ?? 50,
    cursors: cursors ?? true,
    persistent: persistent ?? true,
  };

  return immerdb(options);
}

// Ref-counted pool using RefcountLeaseManager so a given project/path syncdb is opened once.
const CLOSE_DELAY_MS = 30_000;
const openSyncdbs = new Map<string, ImmerDB>();
const leases = new RefcountLeaseManager<string>({
  delayMs: CLOSE_DELAY_MS,
  disposer: async (key: string) => {
    const db = openSyncdbs.get(key);
    if (!db) return;
    try {
      await db.close();
      logger.debug("closed syncdb", { key });
    } catch (err) {
      logger.debug("close syncdb failed", { key, err });
    } finally {
      openSyncdbs.delete(key);
    }
  },
});
const leaseReleases: Map<string, Array<() => Promise<void>>> = new Map();

function poolKey(project_id: string, path: string): string {
  return `${project_id}:${path}`;
}

function pushRelease(key: string, release: () => Promise<void>) {
  const arr = leaseReleases.get(key);
  if (arr) {
    arr.push(release);
  } else {
    leaseReleases.set(key, [release]);
  }
}

function popRelease(key: string): (() => Promise<void>) | undefined {
  const arr = leaseReleases.get(key);
  if (!arr) return undefined;
  const rel = arr.pop();
  if (arr.length === 0) {
    leaseReleases.delete(key);
  }
  return rel;
}

export async function acquireChatSyncDB(
  opts: CreateChatSyncDBOptions,
): Promise<ImmerDB> {
  const key = poolKey(opts.project_id, opts.path);
  const release = await leases.acquire(key);
  const existing = openSyncdbs.get(key);
  if (existing) {
    pushRelease(key, release);
    return existing;
  }
  logger.debug("acquireChatSyncDB: create new", { key });
  const db = createChatSyncDB(opts);
  const ready = db.isReady()
    ? Promise.resolve()
    : new Promise<void>((res, rej) => {
        db.once("ready", res);
        db.once("error", rej);
      });
  try {
    await ready;
    openSyncdbs.set(key, db);
    pushRelease(key, release);
    return db;
  } catch (err) {
    // Creation failed; drop the lease.
    await release();
    throw err;
  }
}

export async function releaseChatSyncDB(
  project_id: string,
  path: string,
): Promise<void> {
  const key = poolKey(project_id, path);
  const release = popRelease(key);
  if (!release) return;
  await release();
}
