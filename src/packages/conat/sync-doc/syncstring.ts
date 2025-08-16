import { SyncClient } from "./sync-client";
import {
  SyncString,
  type SyncStringOpts,
} from "@cocalc/sync/editor/string/sync";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { type MakeOptional } from "./syncdb";

export interface SyncStringOptions
  extends MakeOptional<Omit<SyncStringOpts, "client">, "fs"> {
  client: ConatClient;
  // no filesystem
  noFs?: boolean;
  // name of the file server that hosts this document:
  service?: string;
}

export type { SyncString };

export function syncstring({
  client,
  service,
  ...opts
}: SyncStringOptions): SyncString {
  const fs = opts.noFs
    ? undefined
    : (opts.fs ?? client.fs({ service, project_id: opts.project_id }));
  const syncClient = new SyncClient(client);
  return new SyncString({ ...opts, fs, client: syncClient });
}
