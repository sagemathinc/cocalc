import type { Client as ConatClient } from "@cocalc/conat/core/client";
import {
  syncdb,
  type SyncDBOptions,
  type SyncDB,
} from "@cocalc/conat/sync-doc/syncdb";

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
  closing?: Promise<void>;
};

const pool = new Map<string, PoolEntry>();
const CLOSE_DELAY_MS = 30_000;

function poolKey(project_id: string, path: string): string {
  return `${project_id}:${path}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function makeEntry(
  key: string,
  opts: CreateChatSyncDBOptions,
): Promise<PoolEntry> {
  const db = createChatSyncDB(opts);
  const ready = db.isReady() ? Promise.resolve() : new Promise<void>((res, rej) => {
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
  // Loop to handle the case where an entry is closing; wait for close then retry.
  for (;;) {
    const entry = pool.get(key);
    if (entry) {
      if (entry.closing) {
        await entry.closing;
        continue;
      }
      entry.refs += 1;
      await entry.ready;
      return entry.db;
    }
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
  if (entry.refs > 0) return;
  if (entry.closing) return;

  entry.closing = (async () => {
    await delay(CLOSE_DELAY_MS);
    if (entry.refs === 0) {
      try {
        await entry.db.close();
      } catch (err) {
        // ignore close errors
      } finally {
        pool.delete(key);
      }
    }
    entry.closing = undefined;
  })();
  await entry.closing;
}
