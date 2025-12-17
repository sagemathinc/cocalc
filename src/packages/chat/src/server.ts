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
  syncdb,
  type SyncDBOptions,
  type SyncDB,
} from "@cocalc/conat/sync-doc/syncdb";
import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("chat:server");

export const CHAT_PRIMARY_KEYS = ["date", "sender_id", "event"];
export const CHAT_STRING_COLS = ["input"];

export interface CreateChatSyncDBOptions
  extends Omit<
    SyncDBOptions,
    "primary_keys" | "path" | "project_id" | "client"
  > {
  client: ConatClient;
  project_id: string;
  path: string;
}

export function createChatSyncDB(opts: CreateChatSyncDBOptions): SyncDB {
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

  const options: SyncDBOptions = {
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

  return syncdb(options);
}

// Ref-counted pool so a given project/path syncdb is opened once at a time.
type PoolEntry = {
  db: SyncDB;
  ready: Promise<void>;
  refs: number;
  closingPromise?: Promise<void>;
  closingTimer?: NodeJS.Timeout;
};

const pool = new Map<string, PoolEntry>();
const CLOSE_DELAY_MS = 30_000;

function poolKey(project_id: string, path: string): string {
  return `${project_id}:${path}`;
}

async function makeEntry(
  key: string,
  opts: CreateChatSyncDBOptions,
): Promise<PoolEntry> {
  const db = createChatSyncDB(opts);
  const ready = db.isReady()
    ? Promise.resolve()
    : new Promise<void>((res, rej) => {
        db.once("ready", res);
        db.once("error", rej);
      });
  const entry: PoolEntry = { db, ready, refs: 1 };
  pool.set(key, entry);
  try {
    await ready;
    return entry;
  } catch (err) {
    pool.delete(key);
    throw err;
  }
}

export async function acquireChatSyncDB(
  opts: CreateChatSyncDBOptions,
): Promise<SyncDB> {
  const key = poolKey(opts.project_id, opts.path);
  // Loop to handle the case where an entry was closing; cancel close and reuse.
  for (;;) {
    const entry = pool.get(key);
    if (entry) {
      if (entry.closingTimer) {
        clearTimeout(entry.closingTimer);
        entry.closingTimer = undefined;
        entry.closingPromise = undefined;
        logger.debug("acquireChatSyncDB: canceled pending close", { key });
      } else if (entry.closingPromise) {
        // Close already in progress; wait and retry.
        await entry.closingPromise;
        continue;
      }
      entry.refs += 1;
      await entry.ready;
      logger.debug("acquireChatSyncDB: reuse existing", {
        key,
        refs: entry.refs,
      });
      return entry.db;
    }
    logger.debug("acquireChatSyncDB: create new", { key });
    return (await makeEntry(key, opts)).db;
  }
}

export async function releaseChatSyncDB(
  project_id: string,
  path: string,
): Promise<void> {
  const key = poolKey(project_id, path);
  const entry = pool.get(key);
  if (!entry) return;
  entry.refs = Math.max(0, entry.refs - 1);
  logger.debug("releaseChatSyncDB", { key, refs: entry.refs });
  if (entry.refs > 0) return;
  if (entry.closingTimer || entry.closingPromise) return;

  entry.closingTimer = setTimeout(() => {
    entry.closingTimer = undefined;
    entry.closingPromise = (async () => {
      if (entry.refs === 0) {
        try {
          await entry.db.close();
          logger.debug("releaseChatSyncDB: closed", { key });
        } catch (err) {
          logger.debug("releaseChatSyncDB: close failed", { key, err });
        } finally {
          pool.delete(key);
        }
      }
      entry.closingPromise = undefined;
    })();
  }, CLOSE_DELAY_MS);
}
