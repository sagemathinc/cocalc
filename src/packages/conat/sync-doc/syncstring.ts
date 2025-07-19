import { SyncClient } from "./sync-client";
import { SyncString } from "@cocalc/sync/editor/string/sync";
import { type Client as ConatClient } from "@cocalc/conat/core/client";

export interface SyncStringOptions {
  project_id: string;
  path: string;
  client: ConatClient;
  // name of the file server that hosts this document:
  service?: string;
}

export type { SyncString };

export function syncstring({
  project_id,
  path,
  client,
  service,
}: SyncStringOptions): SyncString {
  const fs = client.fs({ service, project_id });
  const syncClient = new SyncClient(client);
  return new SyncString({
    project_id,
    path,
    client: syncClient,
    fs,
  });
}
