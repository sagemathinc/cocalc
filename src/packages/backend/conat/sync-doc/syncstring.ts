import { Client } from "./client";
import { SyncString } from "@cocalc/sync/editor/string/sync";
import { a_txt } from "@cocalc/sync/editor/string/test/data";
import { once } from "@cocalc/util/async-utils";

export default async function ephemeralSyncstring() {
  const { client_id, project_id, path, init_queries } = a_txt();
  const client = new Client(init_queries, client_id);
  const syncstring = new SyncString({
    project_id,
    path,
    client,
    ephemeral: true,
  });
  // replace save to disk, since otherwise unless string is empty,
  // this will hang forever... and it is called on close.
  // @ts-ignore
  syncstring.save_to_disk = async () => Promise<void>;
  await once(syncstring, "ready");
  return syncstring;
}
