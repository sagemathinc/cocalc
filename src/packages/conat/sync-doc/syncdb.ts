import { SyncClient } from "./sync-client";
import { SyncDB, type SyncDBOpts0 } from "@cocalc/sync/editor/db";
import { type Client as ConatClient } from "@cocalc/conat/core/client";

export type MakeOptional<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

export interface SyncDBOptions
  extends MakeOptional<Omit<SyncDBOpts0, "client">, "fs"> {
  client: ConatClient;
  // name of the file service that hosts this file:
  service?: string;
}

export type { SyncDB };

export function syncdb({ client, service, ...opts }: SyncDBOptions): SyncDB {
  const fs =
    opts.fs ??
    client.fs({
      service,
      project_id: opts.project_id,
      compute_server_id: opts.compute_server_id,
    });
  const syncClient = new SyncClient(client);
  return new SyncDB({ ...opts, fs, client: syncClient });
}
