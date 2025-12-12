import { SyncClient } from "./sync-client";
import { ImmerDB, type ImmerDBOpts0 } from "@cocalc/sync/editor/immer-db";
import { type Client as ConatClient } from "@cocalc/conat/core/client";

export type MakeOptional<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

export interface ImmerDBOptions
  extends MakeOptional<Omit<ImmerDBOpts0, "client">, "fs"> {
  client: ConatClient;
  // name of the file service that hosts this file:
  service?: string;
}

export type { ImmerDB };

export function immerdb({ client, service, ...opts }: ImmerDBOptions): ImmerDB {
  const fs =
    opts.fs ??
    client.fs({
      service,
      project_id: opts.project_id,
      compute_server_id: opts.compute_server_id,
    });
  const syncClient = new SyncClient(client);
  return new ImmerDB({ ...opts, fs, client: syncClient });
}
