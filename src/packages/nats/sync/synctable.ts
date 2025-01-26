import { SyncTableKV, type NatsEnv } from "./synctable-kv";
import { SyncTableKVAtomic } from "./synctable-kv-atomic";
import { SyncTableStream } from "./synctable-stream";

export type SyncTable = SyncTableKV | SyncTableStream | SyncTableKVAtomic;

export function createSyncTable({
  query,
  env,
  account_id,
  project_id,
  atomic,
  stream,
}: {
  query;
  env: NatsEnv;
  account_id?: string;
  project_id?: string;
  atomic?: boolean;
  stream?: boolean;
}) {
  if (stream) {
    if (atomic) {
      throw Error("atomic stream not implemented yet");
    }
    return new SyncTableStream({ query, env, account_id, project_id });
  }
  if (atomic) {
    return new SyncTableKVAtomic({ query, env, account_id, project_id });
  } else {
    return new SyncTableKV({ query, env, account_id, project_id });
  }
}
