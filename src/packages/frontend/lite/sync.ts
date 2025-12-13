/*
This is a quick proof of concept for how sync may end up working in the context
of lite/offline-first for cocalc.
*/

import { webapp_client } from "@cocalc/frontend/webapp-client";
import { SyncDoc } from "@cocalc/sync/editor/generic/sync-doc";
import { ConatClient } from "@cocalc/frontend/conat/client";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";
import { debounce } from "lodash";
import { once } from "@cocalc/util/async-utils";
import { isJupyterPath, ipynbPath } from "@cocalc/util/jupyter/names";

// we lock remote file for this long whenever we save it to disk,
// so remote doesn't try to read it due to change at the same time,
// and also do so again if mutagen is syncing it.
const WRITE_LOCK_TIME = 5000;

const REMOTE_READY_TIMEOUT = 2000;

const CHANGE_DEBOUNCE = 1000;

export function init() {
  console.log("lite: init remote sync");
  SyncDoc.lite = true;
  SyncDoc.events.on("new", (doc) => {
    if (doc.client.client_id() == webapp_client.account_id) {
      console.log("local doc, so connecting to remote");
      // it's a local doc, so we connect it to remote
      // TODO: of course, this should depend on which path it is in!
      connectToRemote(doc);
    }
  });

  // start creating client
  remoteClient();
}

let remote: null | ConatClient;
export function remoteClient() {
  if (remote) {
    return remote;
  }
  const address = location.origin + join(appBasePath + "/conat-remote");
  remote = new ConatClient(webapp_client, { address, remote: true });
  // @ts-ignore
  webapp_client.remote = remote;
  return remote!;
}

// doc must be local
export async function connectToRemote(doc: SyncDoc) {
  console.log("WARNING: remote sync is NOT fully implemented!!");
  if (doc.get_state() != "ready") {
    await once(doc, "ready");
  }

  const client = remoteClient();
  // @ts-ignore
  const conat = client.conat();

  const doc2 = await remoteSyncDoc(doc);
  if (doc2.get_state() != "ready") {
    try {
      await once(doc2, "ready", REMOTE_READY_TIMEOUT);
      // @ts-ignore
      const lastChanged =
        Math.max(doc.last_changed() ?? 0, doc2.last_changed() ?? 0) +
        WRITE_LOCK_TIME;
      doc.push(doc2);
      doc.pull(doc2);
    } catch (err) {
      console.log("timed out waiting for remote doc to be ready");
    }
  }

  doc.on("before-save-to-disk", async () => {
    if (doc2.get_state() != "ready") return;
    try {
      await doc2.fs.lockFile(savePath(doc2.path), WRITE_LOCK_TIME);
    } catch {}
  });

  doc2.on("before-save-to-disk", async () => {
    if (doc.get_state() != "ready") return;
    try {
      await doc.fs.lockFile(savePath(doc.path), WRITE_LOCK_TIME);
    } catch {}
  });

  doc.on(
    "change",
    debounce(
      () => {
        if (doc.get_state() != "ready" || doc2.get_state() != "ready") {
          return;
        }
        doc.push(doc2, { source: "lite" });
      },
      CHANGE_DEBOUNCE,
      { leading: false, trailing: true },
    ),
  );
  doc2.on(
    "change",
    debounce(
      () => {
        if (doc.get_state() != "ready" || doc2.get_state() != "ready") {
          return;
        }
        doc.pull(doc2, { source: "base" });
      },
      CHANGE_DEBOUNCE,
      { leading: false, trailing: true },
    ),
  );
  doc.on("closed", () => {
    doc2.close();
  });
}

export async function remoteSyncDoc(doc: SyncDoc): Promise<SyncDoc> {
  const client = remoteClient();
  const conat = client.conat();
  const { doctype } = doc;
  await conat.waitUntilSignedIn();
  const project_id = conat.info?.user?.project_id;
  if (!project_id) {
    throw Error("client must be a project client");
  }
  const opts = {
    project_id,
    path: doc.path,
    noSaveToDisk: true,
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

function savePath(path: string): string {
  if (isJupyterPath(path)) {
    return ipynbPath(path);
  } else {
    return path;
  }
}

//window.x = { remoteClient, remoteSyncDoc, connectToRemove };
