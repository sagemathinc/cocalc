/* This runs in the project and handles api calls. */

import { fromCompressedJSON } from "./compressed-json";
import getLogger from "@cocalc/backend/logger";
import type { FilesystemState } from "./types";
import { mtimeDirTree } from "./util";

const log = getLogger("sync-fs:handle-api-call").debug;

interface Options {
  computeStateJson?: string;
  computeStateDiffJson?: string; // not implemented yet
  exclude?: string[];
}

export default async function handleApiCall(opts: Options) {
  log("handleApiCall");
  let computeState;
  if (opts.computeStateJson) {
    computeState = fromCompressedJSON(opts.computeStateJson);
  } else {
    throw Error("not implemented");
  }
  if (!process.env.HOME) {
    throw Error("HOME must be defined");
  }

  const projectState = await getProjectState(opts.exclude);

  const operations = getOperations({ computeState, projectState });
}

let lastProjectState: FilesystemState = {};
let lastCallTime = 0;
async function getProjectState(exclude) {
  const now = Math.floor(Date.now() / 1000); // in integers seconds
  if (now - lastCallTime <= 5) {
    // don't update too frequently
    return lastProjectState;
  }
  if (!process.env.HOME) {
    throw Error("HOME must be defined");
  }
  const projectState = await mtimeDirTree({
    path: process.env.HOME,
    exclude,
  });

  for (const path in lastProjectState) {
    if (projectState[path] === undefined) {
      // it is currently deleted.  If it was already marked deleted at a point in time,
      // just stay with that time.  If now, consider it deleted now (negative sign means "deleted").
      projectState[path] =
        lastProjectState[path] < 0 ? lastProjectState[path] : -now;
    }
  }

  lastProjectState = projectState;
  lastCallTime = now;
  return projectState;
}

function getOperations({ computeState, projectState }): {
  deleteOnCompute: string[];
  deleteOnProject: string[];
  copyFromProject: string[];
  copyFromCompute: string[];
} {
  const deleteOnCompute: string[] = [];
  const deleteOnProject: string[] = [];
  const copyFromProject: string[] = [];
  const copyFromCompute: string[] = [];

  for (const path in projectState) {
    const projectMtime = projectState[path];
    const computeMtime = computeState[path];
    if (projectMtime == computeMtime) {
      // definitely nothing to do
      continue;
    }
    if (projectMtime !== undefined && computeMtime === undefined) {
      // file is NOT stored on compute server, so no need to worry about it
      continue;
    }
    // something must be done!  What?

    if (projectMtime === undefined) {
      if (computeMtime < 0) {
        // it's supposed to be deleted and it's gone, so nothing to do.
        continue;
      }
      // it's definitely NOT on the project but it is on the compute server, so we need it.
      copyFromCompute.push(path);
      continue;
    }
  }

  return { deleteOnCompute, deleteOnProject, copyFromProject, copyFromCompute };
}
