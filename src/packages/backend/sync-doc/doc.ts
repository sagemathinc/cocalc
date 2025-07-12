import { Client } from "@cocalc/backend/sync-doc/client";
import { SyncString } from "@cocalc/sync/editor/string";
import { once } from "@cocalc/util/async-utils";
import { client_db } from "@cocalc/util/schema";
import { uuid } from "@cocalc/util/misc";
import type { Client as ConatClient } from "@cocalc/conat/core/client";

export async function syncstring({
  project_id,
  path,
  conat,
}: {
  project_id?: string;
  path?: string;
  conat: ConatClient;
}) {
  const string_id = client_db.sha1(project_id, path);
  const client = new Client(conat);

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
