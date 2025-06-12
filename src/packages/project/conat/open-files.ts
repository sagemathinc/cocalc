/*
Handle opening files in a project to save/load from disk and also enable compute capabilities.

DEVELOPMENT:

0. From the browser with the project opened, terminate the open-files api service:


    await cc.client.conat_client.projectApi(cc.current()).system.terminate({service:'open-files'})



Set env variables as in a project (see  api/index.ts ), then in nodejs:

DEBUG_CONSOLE=yes DEBUG=cocalc:debug:project:conat:* node

    x = await require("@cocalc/project/conat/open-files").init(); Object.keys(x)


[ 'openFiles', 'openDocs', 'formatter', 'terminate', 'computeServers', 'cc' ]

> x.openFiles.getAll();

> Object.keys(x.openDocs)

> s = x.openDocs['z4.tasks']
// now you can directly work with the syncdoc for a given file,
// but from the perspective of the project, not the browser!
//
//

OR:

 echo "require('@cocalc/project/conat/open-files').init(); require('@cocalc/project/bug-counter').init()" | node

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


IN A LIVE RUNNING PROJECT IN KUCALC:

Ssh in to the project itself.  You can use a terminal because that very terminal will be broken by
doing this!  Then:

/cocalc/github/src/packages/project$ . /cocalc/nvm/nvm.sh
/cocalc/github/src/packages/project$ COCALC_PROJECT_ID=... COCALC_SECRET_TOKEN="/secrets/secret-token/token"  CONAT_SERVER=hub-conat node  # not sure about CONAT_SERVER
Welcome to Node.js v20.19.0.
Type ".help" for more information.
> x = await require("@cocalc/project/conat/open-files").init(); Object.keys(x)
[ 'openFiles', 'openDocs', 'formatter', 'terminate', 'computeServers' ]
>


*/

import {
  openFiles as createOpenFiles,
  type OpenFiles,
  type OpenFileEntry,
} from "@cocalc/project/conat/sync";
import { getSyncDocType } from "@cocalc/conat/sync/syncdoc-info";
import { CONAT_OPEN_FILE_TOUCH_INTERVAL } from "@cocalc/util/conat";
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
import { type ConatService } from "@cocalc/conat/service/service";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { map as awaitMap } from "awaiting";
import { unlink } from "fs/promises";
import { join } from "path";
import {
  computeServerManager,
  ComputeServerManager,
} from "@cocalc/conat/compute/manager";
import { JUPYTER_SYNCDB_EXTENSIONS } from "@cocalc/util/jupyter/names";
import { connectToConat } from "@cocalc/project/conat/connection";

// ensure conat connection stuff is initialized
import "@cocalc/project/conat/env";
import { chdir } from "node:process";

const logger = getLogger("project:conat:open-files");

// we check all files we are currently managing this frequently to
// see if they exist on the filesystem:
const FILE_DELETION_CHECK_INTERVAL = 5000;

// once we determine that a file does not exist for some reason, we
// wait this long and check *again* just to be sure.  If it is still missing,
// then we close the file in memory and set the file as deleted in the
// shared openfile state.
const FILE_DELETION_GRACE_PERIOD = 2000;

// We NEVER check a file for deletion for this long after first opening it.
// This is VERY important, since some documents, e.g., jupyter notebooks,
// can take a while to get created on disk the first time.
const FILE_DELETION_INITIAL_DELAY = 15000;

let openFiles: OpenFiles | null = null;
let formatter: any = null;
const openDocs: { [path: string]: SyncDoc | ConatService } = {};
let computeServers: ComputeServerManager | null = null;
const openTimes: { [path: string]: number } = {};

export function getSyncDoc(path: string): SyncDoc | undefined {
  const doc = openDocs[path];
  if (doc instanceof SyncString || doc instanceof SyncDB) {
    return doc;
  }
  return undefined;
}

export async function init() {
  logger.debug("init");

  if (process.env.HOME) {
    chdir(process.env.HOME);
  }

  openFiles = await createOpenFiles();

  computeServers = computeServerManager({ project_id });
  await computeServers.waitUntilReady();
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
  return {
    openFiles,
    openDocs,
    formatter,
    terminate,
    computeServers,
    cc: await connectToConat(),
  };
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
  return Date.now() - 2.5 * CONAT_OPEN_FILE_TOUCH_INTERVAL;
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
    path.endsWith("." + JUPYTER_SYNCDB_EXTENSIONS) ||
    path.endsWith(".sagews") ||
    path.endsWith(".term")
  ) {
    return false;
  }
  return true;
}

async function closeIgnoredFilesLoop() {
  while (openFiles?.state == "connected") {
    await delay(CONAT_OPEN_FILE_TOUCH_INTERVAL);
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
    await delay(CONAT_OPEN_FILE_TOUCH_INTERVAL);
  }
}

async function checkForFileDeletion(path: string) {
  if (openFiles == null) {
    return;
  }
  if (Date.now() - (openTimes[path] ?? 0) <= FILE_DELETION_INITIAL_DELAY) {
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
    // if file doesn't exist and still doesn't exist in a while,
    // mark deleted, which also causes a close.
    if (await exists(fullPath)) {
      return;
    }
    // still doesn't exist?
    // We must give things a reasonable amount of time, e.g., otherwise
    // creating a file (e.g., jupyter notebook) might take too long and
    // we randomly think it is deleted before we even make it!
    await delay(FILE_DELETION_GRACE_PERIOD);
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
    await delay(FILE_DELETION_CHECK_INTERVAL);
    if (openFiles?.state != "connected") {
      return;
    }
    const paths = Object.keys(openDocs);
    if (paths.length == 0) {
      // logger.debug("watchForFileDeletionLoop: no paths currently open");
      continue;
    }
    //     logger.debug(
    //       "watchForFileDeletionLoop: checking",
    //       paths.length,
    //       "currently open paths to see if any were deleted",
    //     );
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
    delete openTimes[path];
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
    openTimes[path] = Date.now();

    if (path.endsWith(".term")) {
      // terminals are handled directly by the project api
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
      case JUPYTER_SYNCDB_EXTENSIONS:
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
. project-env.sh 
node
unset DEBUG
node
. project-env.sh 
node
ls
more project-env.sh 
ls
. project-env.sh 
unset DEBUG
node
