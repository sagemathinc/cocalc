/* This runs in the project and handles api calls. */

import { fromCompressedJSON } from "./compressed-json";
import getLogger from "@cocalc/backend/logger";
import type { FilesystemState } from "./types";
import { metadataFile, mtimeDirTree, remove, writeFileLz4 } from "./util";
import { join } from "path";
import { mkdir, rename, readFile, writeFile } from "fs/promises";
import type { MesgSyncFSOptions } from "@cocalc/comm/websocket/types";
import { sha1 } from "@cocalc/backend/sha1";
//import type { Spark } from "primus";
type Spark = any; // for now

const log = getLogger("sync-fs:handle-api-call").debug;

const CLOCK_THRESH_MS = 5 * 1000;

export default async function handleApiCall({
  computeStateJson,
  exclude = [],
  compute_server_id,
  now, // time in ms since epoch on compute server
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
  // This can also happen if the network connection breaks for a bit, e.g., when
  // restarting the project.
  const clockSkew = Math.abs((now ?? 0) - Date.now());
  if (clockSkew >= CLOCK_THRESH_MS) {
    throw Error(
      `Compute server sync time is off by ${clockSkew}ms, which exceeds the ${CLOCK_THRESH_MS}ms threshhold.  Try again and possibly double check your clock settings.`,
    );
  }

  const meta = await metadataFile({ path: process.env.HOME, exclude });
  const projectState = await getProjectState(meta, exclude);

  const {
    removeFromCompute,
    removeFromProject,
    copyFromProject,
    copyFromCompute,
  } = getOperations({ computeState, projectState });

  if (removeFromProject.length > 0) {
    await remove(removeFromProject, process.env.HOME);
  }

  await writeMetadataFile({ compute_server_id, meta });

  return {
    removeFromCompute,
    copyFromCompute,
    copyFromProjectTar:
      copyFromProject.length > 0
        ? await createCopyFromProjectTar(copyFromProject, compute_server_id)
        : undefined,
  };
}

let lastMetadataFileHash: { [compute_server_id: number]: string } = {};
async function writeMetadataFile({ compute_server_id, meta }) {
  let start = Date.now();
  const hash = sha1(meta);
  const path = join(getStateDir(compute_server_id), "meta");
  const tmp = join(path, ".meta.lz4");
  const target = join(path, "meta.lz4");
  if (hash == lastMetadataFileHash[compute_server_id]) {
    log(
      `writeMetadataFile: not writing "${target}" since hash didn't change. Hash time =`,
      Date.now() - start,
      "ms",
    );
    return;
  }
  lastMetadataFileHash[compute_server_id] = hash;
  await mkdir(path, { recursive: true });
  await writeFileLz4(tmp, meta);
  // ensure this is atomic
  await rename(tmp, target);
  log(
    `writeMetadataFile: wrote out "${target}" atomically. Total time =`,
    Date.now() - start,
    "ms",
  );
}

function getStateDir(compute_server_id): string {
  if (!process.env.HOME) {
    throw Error("HOME env var must be set");
  }
  return join(process.env.HOME, ".compute-servers", `${compute_server_id}`);
}

// This is the path to a file with the names
// of the files to copy via tar, separated by NULL.
// **This is not an actual tarball.**
// We use NULL instead of newline so that filenames
// with newlines in them work, and this should be processed
// with tar using the --null option.
async function createCopyFromProjectTar(
  paths: string[],
  compute_server_id: number,
): Promise<string> {
  if (!process.env.HOME) {
    throw Error("HOME must be defined");
  }
  const stateDir = getStateDir(compute_server_id);
  await mkdir(stateDir, { recursive: true });
  const target = join(stateDir, "copy-from-project");
  await writeFile(target, paths.join("\0"));
  const i = target.lastIndexOf(stateDir);
  return target.slice(i);
}

// we have to use separate cache/state for each exclude list, unfortunately. in practice,
// they should often be similar or the same, because people will rarely customize this (?).
let lastProjectState: { [exclude: string]: FilesystemState } = {};
async function getProjectState(meta, exclude): Promise<FilesystemState> {
  const now = Math.floor(Date.now() / 1000); // in integers seconds
  const key = JSON.stringify(exclude);
  const lastState = lastProjectState[key] ?? {};

  if (!process.env.HOME) {
    throw Error("HOME must be defined");
  }
  const projectState = await mtimeDirTree({
    path: process.env.HOME,
    exclude,
    metadataFile: meta,
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
    // We use >= instead of > so that ties are broken in favor of the project,
    // which is an arbitrary but consistent choice.
    if (Math.abs(projectMtime) >= Math.abs(computeMtime)) {
      // project version is newer
      if (projectMtime > 0) {
        // it was edited later on the project
        copyFromProject.push(path);
      } else {
        // it was deleted from the project, so now need to delete on compute
        removeFromCompute.push(path);
      }
      return;
    } else {
      // compute version is newer
      if (computeMtime > 0) {
        // edited on compute later
        copyFromCompute.push(path);
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

const sparks: { [compute_server_id: number]: Spark } = {};

export async function handleComputeServerSyncRegister(
  { compute_server_id },
  spark,
) {
  log("handleComputeServerSyncRegister -- registering ", { compute_server_id });
  // save the connection so we can send a sync_request
  // message later.
  sparks[compute_server_id] = spark;
}

// User has requested that compute_server_id
// do sync right now via the browser websocket api.
export async function handleSyncFsRequestCall({ compute_server_id }) {
  const spark = sparks[compute_server_id];
  if (spark != null) {
    log("handleSyncFsRequestCall: success");
    spark.write({ event: "compute_server_sync_request" });
    return { status: "ok" };
  } else {
    log("handleSyncFsRequestCall: fail");
    throw Error(
      `no connection to compute server: ${JSON.stringify(Object.keys(sparks))}`,
    );
    //throw Error("no connection to compute server");
  }
}

export async function handleCopy(opts: {
  event: string;
  compute_server_id: number;
  paths: string[];
  timeout?: number;
}) {
  log("handleCopy: ", opts);
  const spark = sparks[opts.compute_server_id];
  if (spark == null) {
    log("handleCopy: no connection");
    throw Error(`no connection to compute server ${opts.compute_server_id}`);
  }
  const id = Math.random();
  spark.write({ ...opts, id });
  // wait for a response with this id
  const handler = (data) => {
    if (data?.id == id) {
      spark.removeListener("data", handler);
      clearTimeout(timeout);
      return data;
    }
  };
  spark.addListener("data", handler);
  const timeout = setTimeout(() => {
    spark.removeListener("data", handler);
    throw Error(
      `timeout - failed to copy files within ${opts.timeout ?? 30000}ms`,
    );
  }, opts.timeout ?? 30000);
}
