/*
Handle opening files in a project to save/load from disk and also enable compute capabilities.

DEVELOPMENT:

0. From the browser, terminate open-files api service running in the project already, if any

    await cc.client.nats_client.projectApi({project_id:'81e0c408-ac65-4114-bad5-5f4b6539bd0e'}).system.terminate({service:'open-files'})
    // {status: 'terminated', service: 'open-files'}


Set env variables as in a project (see  api/index.ts ), then in nodejs:

DEBUG_CONSOLE=yes DEBUG=cocalc:debug:project:nats:open-files node

> x = await require("@cocalc/project/nats/open-files").init(); Object.keys(x)
[ 'openFiles', 'openSyncDocs' ]

> x.openFiles.getAll();

> Object.keys(x.openSyncDocs)

> s = x.openSyncDocs['z4.tasks']
// now you can directly work with the syncdoc for a given file,
// but from the perspective of the project, not the browser!

*/

import {
  openFiles as createOpenFiles,
  type OpenFiles,
  type OpenFileEntry,
} from "@cocalc/project/nats/sync";
import { NATS_OPEN_FILE_TOUCH_INTERVAL } from "@cocalc/util/nats";
import { /*compute_server_id,*/ project_id } from "@cocalc/project/data";
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
  openFiles = await createOpenFiles();

  // initialize
  for (const entry of openFiles.getAll()) {
    handleChange(entry);
  }

  // start loop to watch for and close files that aren't touched frequently:
  closeIgnoredFilesLoop();

  // handle changes
  openFiles.on("change", (entry) => {
    handleChange(entry);
  });

  // usefule for development
  return { openFiles, openSyncDocs };
}

export function terminate() {
  logger.debug("terminating open-files service");
  for (const path in openSyncDocs) {
    closeSyncDoc(path);
  }
  openFiles?.close();
  openFiles = null;
}

const openSyncDocs: { [path: string]: SyncDoc } = {};
// for dev
export { openSyncDocs };

function getCutoff() {
  return new Date(Date.now() - 2.5 * NATS_OPEN_FILE_TOUCH_INTERVAL);
}

async function handleChange({ path, open, time }: OpenFileEntry) {
  logger.debug("handleChange", { path, open, time });
  const syncDoc = openSyncDocs[path];
  const isOpenHere = syncDoc != null;
  // TODO: need another table with compute server mappings
  //   const id = 0; // todo
  //   if (id != compute_server_id) {
  //     if (isOpenHere) {
  //       // close it here
  //       logger.debug("handleChange: closing", { path });
  //       closeSyncDoc(path);
  //     }
  //     // no further responsibility
  //     return;
  //   }
  if (!open) {
    if (isOpenHere) {
      logger.debug("handleChange: closing", { path });
      closeSyncDoc(path);
    }
    return;
  }
  if (time != null && open && time >= getCutoff()) {
    if (!isOpenHere) {
      logger.debug("handleChange: opening", { path });
      // users actively care about this file being opened HERE, but it isn't
      openSyncDoc(path);
    }
    return;
  }
}

function supportAutoclose(path: string): boolean {
  // this feels way too "hard coded"; alternatively, maybe we make the kernel or whatever
  // actually update the interest?  or something else...
  if (path.endsWith(".ipynb.sage-jupyter2") || path.endsWith(".sagews")) {
    return false;
  }
  return true;
}

async function closeIgnoredFilesLoop() {
  while (openFiles != null && openFiles.state == "connected") {
    await delay(NATS_OPEN_FILE_TOUCH_INTERVAL);
    if (openFiles.state != "connected") {
      return;
    }
    const paths = Object.keys(openSyncDocs);
    if (paths.length == 0) {
      logger.debug("closeIgnoredFiles: no paths currently open");
      continue;
    }
    logger.debug(
      "closeIgnoredFiles: checking",
      paths.length,
      "currently open paths...",
    );
    const cutoff = getCutoff();
    for (const path of paths) {
      const entry = openFiles.get(path);
      if (
        entry.time != null &&
        entry.time <= cutoff &&
        supportAutoclose(path)
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
    logger.debug(`WARNING -- issue closing syncdoc -- ${err}`);
    openFiles?.setError(path, err);
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
    logger.debug(`openSyncDoc failed - error = ${err}`);
    return;
  }
  const { type, opts } = x;
  logger.debug("openSyncDoc got", { path, type, opts });

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
  // global.z = { syncstrings };
  let s = syncstrings.get_one();
  if (s?.doctype == null) {
    // wait until there is a syncstring and its doctype is set:
    await syncstrings.wait(() => {
      s = syncstrings.get_one();
      return s?.doctype != null;
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
