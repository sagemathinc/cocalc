/* This runs in the project and handles api calls. */

import { fromCompressedJSON } from "./compressed-json";
import getLogger from "@cocalc/backend/logger";
import type { FilesystemState } from "./types";
import { createTarball, mtimeDirTree, remove } from "./util";
import { join } from "path";
import { mkdir, readFile /* writeFile */ } from "fs/promises";
import type { MesgSyncFSOptions } from "@cocalc/comm/websocket/types";

const log = getLogger("sync-fs:handle-api-call").debug;

const SETTLE_TIMEOUT_S = 3;

export default async function handleApiCall({
  computeStateJson,
  exclude,
  compute_server_id,
}: MesgSyncFSOptions) {
  log("handleApiCall");
  let computeState;
  if (computeStateJson) {
    computeState = fromCompressedJSON(await readFile(computeStateJson));
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
        ? await createCopyFromProjectTar(copyFromProject, compute_server_id)
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
  const fullPath = await createTarball(
    join(process.env.HOME, stateDir, "copy-from-project"),
    paths,
    process.env.HOME,
  );
  const i = fullPath.lastIndexOf(stateDir);
  return fullPath.slice(i);
}

// we have to use separate cache/state for each exclude list, unfortunatley. in practice,
// they should often be similar or the same (?).
let lastProjectState: { [exclude: string]: FilesystemState } = {};
let lastCallTime: { [exclude: string]: number } = {};
export async function getProjectState(exclude) {
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

  //   // this is for DEBUGING ONLY!
  //   await writeFile(
  //     join(process.env.HOME, ".compute-servers", "project-state.json"),
  //     JSON.stringify(projectState),
  //   );

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

  // We ONLY copy files if their last mtime is
  // at least a few seconds in the past, to reduce the chance
  // of having to deal with actively modified files.
  // Of course, this means more "lag".
  const cutoff = Math.floor(Date.now() / 1000) - SETTLE_TIMEOUT_S;

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
      if (computeMtime <= cutoff) {
        copyFromCompute.push(path);
      }
      return;
    }

    // now both projectMtime and computeMtime are defined and different
    if (Math.abs(projectMtime) > Math.abs(computeMtime)) {
      // project version is newer
      if (projectMtime > 0) {
        // it was edited later on the project
        if (projectMtime <= cutoff) {
          copyFromProject.push(path);
        }
      } else {
        // it was deleted from the project, so now need to delete on compute
        removeFromCompute.push(path);
      }
      return;
    } else {
      // compute version is newer
      if (computeMtime > 0) {
        // edited on compute later
        if (computeMtime <= cutoff) {
          copyFromCompute.push(path);
        }
      } else {
        // deleted on compute, so now also need to delete in project
        removeFromProject.push(path);
      }
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
