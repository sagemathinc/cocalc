/*
Handle opening files in a project to save/load from disk and also enable compute capabilities.

DEVELOPMENT:

0. From the browser, terminate open-files api service running in the project already, if any

    await cc.client.nats_client.projectApi({project_id:'00847397-d6a8-4cb0-96a8-6ef64ac3e6cf'}).system.terminate({service:'open-files'})


    // {status: 'terminated', service: 'open-files'}


Set env variables as in a project (see  api/index.ts ), then in nodejs:

DEBUG_CONSOLE=yes DEBUG=cocalc:debug:project:nats:open-files node

> x = await require("@cocalc/project/nats/open-files").init(); Object.keys(x)
[ 'openFiles', 'openDocs', 'formatter', 'terminate' ]

> x.openFiles.getAll();

> Object.keys(x.openDocs)

> s = x.openDocs['z4.tasks']
// now you can directly work with the syncdoc for a given file,
// but from the perspective of the project, not the browser!

*/

import {
  openFiles as createOpenFiles,
  type OpenFiles,
  type OpenFileEntry,
} from "@cocalc/project/nats/sync";
import { getSyncDocType } from "@cocalc/nats/sync/syncdoc-info";
import { NATS_OPEN_FILE_TOUCH_INTERVAL } from "@cocalc/util/nats";
import { /*compute_server_id,*/ project_id } from "@cocalc/project/data";
import type { SyncDoc } from "@cocalc/sync/editor/generic/sync-doc";
import { getClient } from "@cocalc/project/client";
import { SyncString } from "@cocalc/sync/editor/string/sync";
import { SyncDB } from "@cocalc/sync/editor/db/sync";
import getLogger from "@cocalc/backend/logger";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { delay } from "awaiting";
import { initJupyterRedux, removeJupyterRedux } from "@cocalc/jupyter/kernel";
import { filename_extension, original_path } from "@cocalc/util/misc";
import { get_blob_store } from "@cocalc/jupyter/blobs";
import { createFormatterService } from "./formatter";
import { type TerminalService } from "@cocalc/nats/service/terminal";
import { createTerminalService } from "./terminal";

// ensure nats connection stuff is initialized
import "@cocalc/backend/nats";

const logger = getLogger("project:nats:open-files");

let openFiles: OpenFiles | null = null;
let formatter: any = null;
const openDocs: { [path: string]: SyncDoc | TerminalService } = {};

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

  formatter = await createFormatterService({ openSyncDocs: openDocs });

  // usefule for development
  return { openFiles, openDocs, formatter, terminate };
}

export function terminate() {
  logger.debug("terminating open-files service");
  for (const path in openDocs) {
    closeDoc(path);
  }
  openFiles?.close();
  openFiles = null;

  formatter?.close();
  formatter = null;
}

function getCutoff() {
  return new Date(Date.now() - 2.5 * NATS_OPEN_FILE_TOUCH_INTERVAL);
}

async function handleChange({ path, open, time }: OpenFileEntry) {
  logger.debug("handleChange", { path, open, time });
  const syncDoc = openDocs[path];
  const isOpenHere = syncDoc != null;
  // TODO: need another table with compute server mappings
  //   const id = 0; // todo
  //   if (id != compute_server_id) {
  //     if (isOpenHere) {
  //       // close it here
  //       logger.debug("handleChange: closing", { path });
  //       closeDoc(path);
  //     }
  //     // no further responsibility
  //     return;
  //   }
  if (!open) {
    if (isOpenHere) {
      logger.debug("handleChange: closing", { path });
      closeDoc(path);
    }
    return;
  }
  if (time != null && open && time >= getCutoff()) {
    if (!isOpenHere) {
      logger.debug("handleChange: opening", { path });
      // users actively care about this file being opened HERE, but it isn't
      openDoc(path);
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
    if (openFiles?.state != "connected") {
      return;
    }
    const paths = Object.keys(openDocs);
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
    for (const entry of openFiles.getAll()) {
      if (
        entry != null &&
        entry.time != null &&
        entry.time <= cutoff &&
        supportAutoclose(entry.path)
      ) {
        logger.debug("closeIgnoredFiles: closing due to inactivity", entry);
        closeDoc(entry.path);
      }
    }
  }
}

const closeDoc = reuseInFlight(async (path: string) => {
  logger.debug("close", { path });
  const doc = openDocs[path];
  if (doc == null) {
    return;
  }
  delete openDocs[path];
  try {
    await doc.close();
  } catch (err) {
    logger.debug(`WARNING -- issue closing doc -- ${err}`);
    openFiles?.setError(path, err);
  }
});

const openDoc = reuseInFlight(async (path: string) => {
  // todo -- will be async and needs to handle SyncDB and all the config...
  logger.debug("openDoc", { path });

  const doc = openDocs[path];
  if (doc != null) {
    return;
  }

  if (path.endsWith(".term")) {
    const service = createTerminalService(path);
    openDocs[path] = service;
    return;
  }

  const client = getClient();
  const doctype = await getSyncDocType({
    project_id,
    path,
    client,
  });
  logger.debug("openDoc got", { path, doctype });

  let syncdoc;
  if (doctype.type == "string") {
    syncdoc = new SyncString({
      ...doctype.opts,
      project_id,
      path,
      client,
    });
  } else {
    syncdoc = new SyncDB({
      ...doctype.opts,
      project_id,
      path,
      client,
    });
  }
  openDocs[path] = syncdoc;

  syncdoc.on("error", (err) => {
    closeDoc(path);
    openFiles?.setError(path, err);
    logger.debug(`syncdoc error -- ${err}`, path);
  });

  // Extra backend support in some cases, e.g., Jupyter, Sage, etc.
  const ext = filename_extension(path);
  switch (ext) {
    case "sage-jupyter2":
      logger.debug("initializing Jupyter backend for ", path);
      await get_blob_store(); // make sure jupyter blobstore is available
      await initJupyterRedux(syncdoc, client);
      const path1 = original_path(syncdoc.get_path());
      syncdoc.on("closed", async () => {
        logger.debug("removing Jupyter backend for ", path1);
        await removeJupyterRedux(path1, project_id);
      });
      break;
  }

  return;
});
