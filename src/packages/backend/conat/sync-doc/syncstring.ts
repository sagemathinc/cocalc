import { SyncClient } from "./sync-client";
import { SyncString } from "@cocalc/sync/editor/string/sync";
import { once } from "@cocalc/util/async-utils";
import { type Client as ConatClient } from "@cocalc/conat/core/client";
import { fsClient } from "@cocalc/conat/files/fs";

export default async function syncstring({
  project_id,
  path,
  client,
  // name of the file server that hosts this document:
  service,
}: {
  project_id: string;
  path: string;
  client: ConatClient;
  service?: string;
}) {
  const fs = fsClient({
    subject: `${service}.project-${project_id}`,
    client,
  });
  const syncClient = new SyncClient(client);
  const syncstring = new SyncString({
    project_id,
    path,
    client: syncClient,
    fs,
  });
  await once(syncstring, "ready");
  return syncstring;
}
