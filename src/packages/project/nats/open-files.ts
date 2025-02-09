/*
Handle opening files in a project to save/load from disk and also enable compute capabilities.

DEVELOPMENT:

0. From the browser, terminate this api server running in the project already, if any

    await cc.client.nats_client.projectApi({project_id:'81e0c408-ac65-4114-bad5-5f4b6539bd0e'}).system.terminate({service:'open-files'})


Set env variables as in a project (see  api/index.ts ), then:

> require("@cocalc/project/nats/open-files").init()

*/

import {
  createOpenFiles,
  OpenFiles,
  Entry,
} from "@cocalc/nats/sync/open-files";
import { NATS_OPEN_FILE_TOUCH_INTERVAL } from "@cocalc/util/nats";
import { compute_server_id, project_id } from "@cocalc/project/data";
import { getEnv } from "./env";
import type { SyncDoc } from "@cocalc/sync/editor/generic/sync-doc";
import { getClient } from "@cocalc/project/client";
import { SyncString } from "@cocalc/sync/editor/string/sync";
import { SyncDB } from "@cocalc/sync/editor/db/sync";
import getLogger from "@cocalc/backend/logger";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { delay } from "awaiting";
import { client_db } from "@cocalc/util/db-schema";

const logger = getLogger("project:nats:open-files");

let openFiles: OpenFiles | null = null;

export async function init() {
  logger.debug("init");
  openFiles = await createOpenFiles({
    project_id,
    env: await getEnv(),
  });
  runLoop();
}

function runLoop() {
  logger.debug("starting run loop");
  if (openFiles != null) {
    const entries: { [path: string]: Entry } = {};
    closeIgnoredFiles(entries, openFiles);
    openFiles.on("change", (entry) => {
      entries[entry.path] = entry;
      handleChange(entry);
    });
  }
  logger.debug("exiting open files run loop");
}

export function terminate() {
  logger.debug("terminating open-files service");
  openFiles?.close();
  for (const path in openSyncDocs) {
    closeSyncDoc(path);
  }
}

const openSyncDocs: { [path: string]: SyncDoc } = {};
// for dev
export { openSyncDocs };

function getCutoff() {
  return new Date(Date.now() - 2.5 * NATS_OPEN_FILE_TOUCH_INTERVAL);
}

async function handleChange({ path, open, time }: Entry) {
  const syncDoc = openSyncDocs[path];
  const isOpenHere = syncDoc != null;
  const id = 0; // todo
  if (id != compute_server_id) {
    if (isOpenHere) {
      // close it here
      closeSyncDoc(path);
    }
    // no further responsibility
    return;
  }
  if (!open) {
    if (isOpenHere) {
      closeSyncDoc(path);
    }
    return;
  }
  if (time != null && open && time >= getCutoff()) {
    if (!isOpenHere) {
      // users actively care about this file being opened HERE, but it isn't
      openSyncDoc(path);
    }
    return;
  }
}

function supportAutoclose(path: string) {
  // this feels way too "hard coded"; alternatively, maybe we make the kernel or whatever
  // actually update the interest?  or something else...
  if (path.endsWith(".ipynb.sage-jupyter2") || path.endsWith(".sagews")) {
    return false;
  }
  return true;
}

async function closeIgnoredFiles(entries, openFiles) {
  while (openFiles.state == "connected") {
    await delay(NATS_OPEN_FILE_TOUCH_INTERVAL);
    if (openFiles.state != "connected") {
      return;
    }
    logger.debug("closeIgnoredFiles: checking...");
    const cutoff = getCutoff();
    for (const path in entries) {
      const entry = entries[path];
      if (
        entry.time <= cutoff &&
        !supportAutoclose(path) &&
        openSyncDocs[path] != null
      ) {
        logger.debug("closeIgnoredFiles: closing due to inactivity", { path });
        closeSyncDoc(path);
      }
    }
  }
}

const closeSyncDoc = reuseInFlight(async (path: string) => {
  logger.debug("close", { path });
  const syncDoc = openSyncDocs[path];
  if (syncDoc == null) {
    return;
  }
  delete openSyncDocs[path];
  try {
    await syncDoc.close();
  } catch (err) {
    // TODO: maybe this could get saved in a nats key-value store?
    logger.debug(`WARNING -- issue closing syncdoc -- ${err}`);
  }
});

const openSyncDoc = reuseInFlight(async (path: string) => {
  // todo -- will be async and needs to handle SyncDB and all the config...
  logger.debug("openSyncDoc", { path });
  const syncDoc = openSyncDocs[path];
  if (syncDoc != null) {
    return;
  }
  const client = getClient();
  let x;
  try {
    const string_id = client_db.sha1(project_id, path);
    const syncstrings = await client.synctable_nats(
      { syncstrings: [{ string_id, doctype: null }] },
      {
        stream: false,
        atomic: false,
        immutable: false,
      },
    );
    x = await getTypeAndOpts(syncstrings);
  } catch (err) {
    logger.debug(`openSyncDoc failed ${err}`);
    return;
  }
  const { type, opts } = x;
  logger.debug("openSyncDoc got", { path, type, opts });
  console.log("openSyncDoc got", { path, type, opts });

  let doc;
  if (type == "string") {
    doc = new SyncString({
      ...opts,
      project_id,
      path,
      client,
    });
  } else {
    doc = new SyncDB({
      ...opts,
      project_id,
      path,
      client,
    });
  }
  openSyncDocs[path] = doc;
  return;
});

async function getTypeAndOpts(
  syncstrings,
): Promise<{ type: string; opts: any }> {
  let s = syncstrings.get_one();
  if (s == null) {
    await syncstrings.wait(() => {
      s = syncstrings.get_one();
      return s != null;
    });
  }
  const opts: any = {};
  let type: string = "";

  let doctype = s.doctype;
  if (doctype != null) {
    try {
      doctype = JSON.parse(doctype);
    } catch {
      doctype = {};
    }
    if (doctype.opts != null) {
      for (const k in doctype.opts) {
        opts[k] = doctype.opts[k];
      }
    }
    type = doctype.type;
  }
  opts.doctype = doctype;
  if (type !== "db" && type !== "string") {
    // fallback type
    type = "string";
  }
  return { type, opts };
}
