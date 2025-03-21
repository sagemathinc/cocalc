/*
Handle opening files in a project to save/load from disk and also enable compute capabilities.

DEVELOPMENT:

0. From the browser with the project opened, terminate the open-files api service:

    await cc.client.nats_client.projectApi(cc.current()).system.terminate({service:'open-files'})


    // {status: 'terminated', service: 'open-files'}


Set env variables as in a project (see  api/index.ts ), then in nodejs:

DEBUG_CONSOLE=yes DEBUG=cocalc:debug:project:nats:* node

    x = await require("@cocalc/project/nats/open-files").init(); Object.keys(x)


[ 'openFiles', 'openDocs', 'formatter', 'terminate', 'computeServers' ]

> x.openFiles.getAll();

> Object.keys(x.openDocs)

> s = x.openDocs['z4.tasks']
// now you can directly work with the syncdoc for a given file,
// but from the perspective of the project, not the browser!

COMPUTE SERVER:

To simulate a compute server, do exactly as above, but also set the environment
variable COMPUTE_SERVER_ID to the *global* (not project specific) id of the compute
server:

   COMPUTE_SERVER_ID=84 node

In this case, you aso don't need to use the terminate command if the compute
server isn't actually running.  To terminate a compute server open files service though:

    (TODO)


EDITOR ACTIONS:

Stop the open-files server and define x as above in a terminal.  You can
then get the actions or store in a nodejs terminal for a particular document
as follows:

project_id = '00847397-d6a8-4cb0-96a8-6ef64ac3e6cf'; path = '2025-03-21-100921.ipynb';
redux = require("@cocalc/jupyter/redux/app").redux;  a = redux.getEditorActions(project_id, path); s = redux.getEditorStore(project_id, path); 0;


*/

import {
  openFiles as createOpenFiles,
  type OpenFiles,
  type OpenFileEntry,
} from "@cocalc/project/nats/sync";
import { getSyncDocType } from "@cocalc/nats/sync/syncdoc-info";
import { NATS_OPEN_FILE_TOUCH_INTERVAL } from "@cocalc/util/nats";
import { compute_server_id, project_id } from "@cocalc/project/data";
import type { SyncDoc } from "@cocalc/sync/editor/generic/sync-doc";
import { getClient } from "@cocalc/project/client";
import { SyncString } from "@cocalc/sync/editor/string/sync";
import { SyncDB } from "@cocalc/sync/editor/db/sync";
import getLogger from "@cocalc/backend/logger";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { delay } from "awaiting";
import { initJupyterRedux, removeJupyterRedux } from "@cocalc/jupyter/kernel";
import { filename_extension, original_path } from "@cocalc/util/misc";
import { createFormatterService } from "./formatter";
import { type NatsService } from "@cocalc/nats/service/service";
import { createTerminalService } from "./terminal";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { map as awaitMap } from "awaiting";
import { unlink } from "fs/promises";
import { join } from "path";
import {
  computeServerManager,
  ComputeServerManager,
} from "@cocalc/nats/compute/manager";

// ensure nats connection stuff is initialized
import "@cocalc/project/nats/env";
import { chdir } from "node:process";

const logger = getLogger("project:nats:open-files");

const FILE_DELETION_CHECK_INTERVAL_MS = 3000;

let openFiles: OpenFiles | null = null;
let formatter: any = null;
const openDocs: { [path: string]: SyncDoc | NatsService } = {};
let computeServers: ComputeServerManager | null = null;

export async function init() {
  logger.debug("init");

  if (process.env.HOME) {
    chdir(process.env.HOME);
  }

  openFiles = await createOpenFiles();

  computeServers = computeServerManager({ project_id });
  await computeServers.init();
  computeServers.on("change", async ({ path, id }) => {
    if (openFiles == null) {
      return;
    }
    const entry = openFiles?.get(path);
    if (entry != null) {
      await handleChange({ ...entry, id });
    } else {
      await closeDoc(path);
    }
  });

  // initialize
  for (const entry of openFiles.getAll()) {
    handleChange(entry);
  }

  // start loop to watch for and close files that aren't touched frequently:
  closeIgnoredFilesLoop();

  // periodically update timestamp on backend for files we have open
  touchOpenFilesLoop();
  // watch if any file that is currently opened on this host gets deleted,
  // and if so, mark it as such, and set it to closed.
  watchForFileDeletionLoop();

  // handle changes
  openFiles.on("change", (entry) => {
    handleChange(entry);
  });

  formatter = await createFormatterService({ openSyncDocs: openDocs });

  // useful for development
  return { openFiles, openDocs, formatter, terminate, computeServers };
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

  computeServers?.close();
  computeServers = null;
}

function getCutoff(): number {
  return Date.now() - 2.5 * NATS_OPEN_FILE_TOUCH_INTERVAL;
}

function computeServerId(path: string): number {
  return computeServers?.get(path) ?? 0;
}

async function handleChange({
  path,
  time,
  deleted,
  backend,
  id,
}: OpenFileEntry & { id?: number }) {
  if (id == null) {
    id = computeServerId(path);
  }
  logger.debug("handleChange", { path, time, deleted, backend, id });
  const syncDoc = openDocs[path];
  const isOpenHere = syncDoc != null;

  if (id != compute_server_id) {
    if (backend?.id == compute_server_id) {
      // we are definitely not the backend right now.
      openFiles?.setNotBackend(path, compute_server_id);
    }
    // only thing we should do is close it if it is open.
    if (isOpenHere) {
      await closeDoc(path);
    }
    return;
  }

  if (deleted?.deleted) {
    if (await exists(path)) {
      // it's back
      openFiles?.setNotDeleted(path);
    } else {
      if (isOpenHere) {
        await closeDoc(path);
      }
      return;
    }
  }

  if (time != null && time >= getCutoff()) {
    if (!isOpenHere) {
      logger.debug("handleChange: opening", { path });
      // users actively care about this file being opened HERE, but it isn't
      await openDoc(path);
    }
    return;
  }
}

function supportAutoclose(path: string): boolean {
  // this feels way too "hard coded"; alternatively, maybe we make the kernel or whatever
  // actually update the interest?  or something else...
  if (
    path.endsWith(".sage-jupyter2") ||
    path.endsWith(".sagews") ||
    path.endsWith(".term")
  ) {
    return false;
  }
  return true;
}

async function closeIgnoredFilesLoop() {
  while (openFiles?.state == "connected") {
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
        openDocs[entry.path] != null &&
        entry.time <= cutoff &&
        supportAutoclose(entry.path)
      ) {
        logger.debug("closeIgnoredFiles: closing due to inactivity", entry);
        closeDoc(entry.path);
      }
    }
  }
}

async function touchOpenFilesLoop() {
  while (openFiles?.state == "connected" && openDocs != null) {
    for (const path in openDocs) {
      openFiles.setBackend(path, compute_server_id);
    }
    await delay(NATS_OPEN_FILE_TOUCH_INTERVAL);
  }
}

async function checkForFileDeletion(path: string) {
  if (openFiles == null) {
    return;
  }
  const id = computeServerId(path);
  if (id != compute_server_id) {
    // not our concern
    return;
  }

  if (path.endsWith(".term")) {
    // term files are exempt -- we don't save data in them and often
    // don't actually make the hidden ones for each frame in the
    // filesystem at all.
    return;
  }
  const entry = openFiles.get(path);
  if (entry == null) {
    return;
  }
  if (entry.deleted?.deleted) {
    // already set as deleted -- shouldn't still be opened
    await closeDoc(entry.path);
  } else {
    if (!process.env.HOME) {
      // too dangerous
      return;
    }
    const fullPath = join(process.env.HOME, entry.path);
    // if file doesn't exist and still doesn't exist in 1 second,
    // mark deleted, which also causes a close.
    if (await exists(fullPath)) {
      return;
    }
    // doesn't exist
    await delay(250);
    if (await exists(fullPath)) {
      return;
    }
    // still doesn't exist
    if (openFiles != null) {
      logger.debug("checkForFileDeletion: marking as deleted -- ", entry);
      openFiles.setDeleted(entry.path);
      await closeDoc(fullPath);
      // closing a file may cause it to try to save to disk the last version,
      // so we delete it if that happens.
      // TODO: add an option to close everywhere to not do this, and/or make
      // it not save on close if the file doesn't exist.
      try {
        if (await exists(fullPath)) {
          await unlink(fullPath);
        }
      } catch {}
    }
  }
}

async function watchForFileDeletionLoop() {
  while (openFiles != null && openFiles.state == "connected") {
    await delay(FILE_DELETION_CHECK_INTERVAL_MS);
    if (openFiles?.state != "connected") {
      return;
    }
    const paths = Object.keys(openDocs);
    if (paths.length == 0) {
      logger.debug("watchForFileDeletionLoop: no paths currently open");
      continue;
    }
    logger.debug(
      "watchForFileDeletionLoop: checking",
      paths.length,
      "currently open paths to see if any were deleted",
    );
    await awaitMap(paths, 20, checkForFileDeletion);
  }
}

const closeDoc = reuseInFlight(async (path: string) => {
  logger.debug("close", { path });
  try {
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
  } finally {
    if (openDocs[path] == null) {
      openFiles?.setNotBackend(path, compute_server_id);
    }
  }
});

const openDoc = reuseInFlight(async (path: string) => {
  logger.debug("openDoc", { path });
  try {
    const doc = openDocs[path];
    if (doc != null) {
      return;
    }

    if (path.endsWith(".term")) {
      const service = await createTerminalService(path);
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
        await initJupyterRedux(syncdoc, client);
        const path1 = original_path(syncdoc.get_path());
        syncdoc.on("closed", async () => {
          logger.debug("removing Jupyter backend for ", path1);
          await removeJupyterRedux(path1, project_id);
        });
        break;
    }
  } finally {
    if (openDocs[path] != null) {
      openFiles?.setBackend(path, compute_server_id);
    }
  }
});
