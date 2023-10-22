/* This runs in the project and handles api calls. */

//import { fromCompressedJSON } from "./compressed-json";
import getLogger from "@cocalc/backend/logger";
import type { FilesystemState } from "./types";
import { createTarball, mtimeDirTree, remove } from "./util";
import { join } from "path";
import { mkdir } from "fs/promises";
import type { MesgSyncFSOptions } from "@cocalc/comm/websocket/types";

const log = getLogger("sync-fs:handle-api-call").debug;

export default async function handleApiCall({
  computeStateJson,
  exclude,
  compute_server_id,
}: MesgSyncFSOptions) {
  log("handleApiCall");
  let computeState;
  if (computeStateJson) {
    computeState = computeState;
    //computeState = fromCompressedJSON(computeStateJson);
  } else {
    throw Error("not implemented");
  }
  if (!process.env.HOME) {
    throw Error("HOME must be defined");
  }

  const projectState = await getProjectState(exclude ?? []);

  const {
    removeFromCompute,
    removeFromProject,
    copyFromProject,
    copyFromCompute,
  } = getOperations({ computeState, projectState });

  if (removeFromProject.length > 0) {
    await remove(removeFromProject, process.env.HOME);
  }

  return {
    removeFromCompute,
    copyFromCompute,
    copyFromProjectTar:
      copyFromProject.length > 0
        ? createCopyFromProjectTar(copyFromProject, compute_server_id)
        : undefined,
  };
}

async function createCopyFromProjectTar(
  paths: string[],
  compute_server_id: number,
): Promise<string> {
  if (!process.env.HOME) {
    throw Error("HOME must be defined");
  }
  const stateDir = join(".compute-servers", `${compute_server_id}`);
  await mkdir(stateDir, { recursive: true });
  return await createTarball(
    join(process.env.HOME, stateDir, "copy-from-project"),
    paths,
  );
}

// we have to use separate cache/state for each exclude list, unfortunatley. in practice,
// they should often be similar or the same (?).
let lastProjectState: { [exclude: string]: FilesystemState } = {};
let lastCallTime: { [exclude: string]: number } = {};
async function getProjectState(exclude) {
  const now = Math.floor(Date.now() / 1000); // in integers seconds
  const key = JSON.stringify(exclude);
  const lastTime = lastCallTime[key] ?? 0;
  const lastState = lastProjectState[key] ?? {};
  if (now - lastTime <= 5) {
    // don't update too frequently
    return lastState;
  }
  lastCallTime[key] = now;
  if (!process.env.HOME) {
    throw Error("HOME must be defined");
  }
  const projectState = await mtimeDirTree({
    path: process.env.HOME,
    exclude,
  });

  // figure out what got deleted in the project
  for (const path in lastState) {
    if (projectState[path] === undefined) {
      // it is currently deleted.  If it was already marked deleted at a point in time,
      // just stay with that time.  If now, consider it deleted now (negative sign means "deleted").
      // NOTE: it's impossible to know exactly when path was actually deleted.
      projectState[path] = lastState[path] < 0 ? lastState[path] : -now;
    }
  }
  lastProjectState[key] = projectState;

  return projectState;
}

// [ ] TODO: worry about files versus directories!
function getOperations({ computeState, projectState }): {
  removeFromCompute: string[];
  removeFromProject: string[];
  copyFromProject: string[];
  copyFromCompute: string[];
} {
  const removeFromCompute: string[] = [];
  const removeFromProject: string[] = [];
  const copyFromProject: string[] = [];
  const copyFromCompute: string[] = [];

  const handlePath = (path) => {
    const projectMtime = projectState[path];
    const computeMtime = computeState[path];
    if (projectMtime == computeMtime) {
      // definitely nothing to do
      return;
    }
    if (projectMtime !== undefined && computeMtime === undefined) {
      // file is NOT stored on compute server, so no need to worry about it
      return;
    }
    // something must be done!  What:
    if (projectMtime === undefined) {
      if (computeMtime < 0) {
        // it's supposed to be deleted and it's gone, so nothing to do.
        return;
      }
      // it's definitely NOT on the project but it is on the compute server, so we need it.
      copyFromCompute.push(path);
      return;
    }

    // now both projectMtime and computeMtime are defined and different
    if (projectMtime > computeMtime) {
      // project version is newer
      copyFromProject.push(path);
      return;
    } else {
      // compute version is newer
      copyFromCompute.push(path);
    }
  };

  for (const path in projectState) {
    handlePath(path);
  }
  for (const path in computeState) {
    if (projectState[path] === undefined) {
      // NOT already handled above
      handlePath(path);
    }
  }

  return {
    removeFromCompute,
    removeFromProject,
    copyFromProject,
    copyFromCompute,
  };
}
