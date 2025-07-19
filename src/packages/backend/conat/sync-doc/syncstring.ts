import { Client } from "./client";
import { SyncString } from "@cocalc/sync/editor/string/sync";
import { once } from "@cocalc/util/async-utils";
import { type SyncDocFilesystem } from "@cocalc/sync/editor/generic/sync-doc";
import { type Client as ConatClient } from "@cocalc/conat/core/client";

export default async function syncstring({
  fs,
  project_id,
  path,
  conat,
}: {
  fs: SyncDocFilesystem;
  project_id: string;
  path: string;
  conat: ConatClient;
}) {
  const client = new Client(conat);
  const syncstring = new SyncString({
    project_id,
    path,
    client,
    fs,
  });
  await once(syncstring, "ready");
  return syncstring;
}
