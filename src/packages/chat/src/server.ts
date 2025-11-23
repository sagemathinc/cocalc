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
