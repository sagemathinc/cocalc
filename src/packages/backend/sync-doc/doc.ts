import { Client } from "@cocalc/backend/sync-doc/client";
import { SyncString } from "@cocalc/sync/editor/string";
import { once } from "@cocalc/util/async-utils";
import { client_db } from "@cocalc/util/schema";
import { uuid } from "@cocalc/util/misc";

export async function syncstring({
  project_id = uuid(),
  path = "a.txt",
}: {
  project_id?: string;
  path?: string;
}) {
  const string_id = client_db.sha1(project_id, path);
  const client_id = uuid();
  const init_queries = {
    syncstrings: [
      {
        snapshot_interval: 5,
        project_id,
        path,
        users: [project_id, client_id],
        string_id,
        last_active: new Date().toISOString(),
        init: { time: new Date().toISOString(), size: 0, error: "" },
        doctype: '{"type":"string"}',
        read_only: false,
        save: { state: "done", error: "", hash: 0, time: Date.now() },
      },
    ],
  };

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
