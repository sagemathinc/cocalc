/*
This is a quick proof of concept for how sync may end up working in the context
of lite/offline-first for cocalc.
*/

import { webapp_client } from "@cocalc/frontend/webapp-client";
import { SyncDoc } from "@cocalc/sync/editor/generic/sync-doc";
import { ConatClient } from "@cocalc/frontend/conat/client";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";

let remote: null | ConatClient;
export function remoteClient() {
  if (remote) {
    return remote;
  }
  const address = location.origin + join(appBasePath + "/conat-remote");
  remote = new ConatClient(webapp_client, { address });
  return remote!;
}

export async function connect(doc) {
  const client = remoteClient();
  const doc2 = await remoteSyncDoc({ client, doc });
  doc.on("change", () => {
    doc.sync(doc2);
  });
  doc2.on("change", () => {
    doc.sync(doc2);
  });
}

export async function remoteSyncDoc({
  doc,
  client,
}: {
  doc: SyncDoc;
  client: ConatClient;
}): Promise<SyncDoc> {
  const { doctype } = doc;
  const conat = client.conat();
  await conat.waitUntilSignedIn();
  const project_id = conat.info?.user?.project_id;
  if (!project_id) {
    throw Error("client must be a project client");
  }
  const opts = {
    project_id,
    path: doc.path,
  };
  const { type } = doctype;
  if (type == "string") {
    return conat.sync.string(opts);
  } else if (type == "db") {
    const { primary_keys, string_cols } = doctype.opts ?? {};
    return conat.sync.db({ ...opts, primary_keys, string_cols });
  } else {
    throw Error(`unknown doc type ${type}`);
  }
}

//window.x = { remoteClient, remoteSyncDoc, connect };
