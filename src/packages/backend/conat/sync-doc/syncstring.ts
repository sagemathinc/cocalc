import { Client } from "./client";
import { SyncString } from "@cocalc/sync/editor/string/sync";
import { a_txt } from "@cocalc/sync/editor/string/test/data";
import { once } from "@cocalc/util/async-utils";
import { type SyncDocFilesystem } from "@cocalc/sync/editor/generic/sync-doc";

export default async function syncstring({
  fs,
  project_id,
  path,
}: {
  fs: SyncDocFilesystem;
  project_id: string;
  path: string;
}) {
  const { client_id, init_queries } = a_txt();
  const client = new Client(init_queries, client_id);
  const syncstring = new SyncString({
    project_id,
    path,
    client,
    ephemeral: true,
    fs,
  });
  await once(syncstring, "ready");
  return syncstring;
}
