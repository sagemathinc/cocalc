/* This runs in the project and handles api calls from computer servers.

It mainly handles a persistent connection from the file system container,
and supports functions including moving files, syncing, executing code,
etc.
*/

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
    computeState = await fromCompressedJSON(await readFile(computeStateJson));
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
  log("handleComputeServerSyncRegister -- registering ", {
    compute_server_id,
    spark_id: spark.id,
  });
  // save the connection so we can send a sync_request message later, and also handle the api
  // calls for copying files back and forth, etc.
  sparks[compute_server_id] = spark;
  const remove = () => {
    if (sparks[compute_server_id]?.id == spark.id) {
      log(
        "handleComputeServerSyncRegister: removing compute server connection due to disconnect -- ",
        { compute_server_id, spark_id: spark.id },
      );
      // the spark connection currently cached is this
      // one, so we remove it. It could be replaced by
      // a new one, in which case we better not remove it.
      delete sparks[compute_server_id];
    }
  };
  spark.on("end", remove);
  spark.on("close", remove);
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
    throw Error(`no connection to compute server -- please start it or restart it`);
    //throw Error("no connection to compute server");
  }
}

function callComputeServerApi(
  compute_server_id,
  mesg,
  timeoutMs = 30000,
  compute = false,
): Promise<any> {
  const spark = compute
    ? computeSparks[compute_server_id]
    : sparks[compute_server_id];
  if (spark == null) {
    log("callComputeServerApi: no connection");
    throw Error(
      `no connection to compute server -- please start or restart it`,
    );
  }
  return new Promise((resolve, reject) => {
    const id = Math.random();
    spark.write({ ...mesg, id });

    const handler = (data) => {
      if (data?.id == id) {
        spark.removeListener("data", handler);
        clearTimeout(timeout);
        if (data.error) {
          reject(Error(data.error));
        } else {
          resolve(data.resp);
        }
      }
    };
    spark.addListener("data", handler);

    const timeout = setTimeout(() => {
      spark.removeListener("data", handler);
      reject(Error(`timeout -- ${timeoutMs}ms`));
    }, timeoutMs);
  });
}

export async function handleCopy(opts: {
  event: string;
  compute_server_id: number;
  paths: string[];
  dest?: string;
  timeout?: number;
}) {
  log("handleCopy: ", opts);
  const mesg = { event: opts.event, paths: opts.paths, dest: opts.dest };
  return await callComputeServerApi(
    opts.compute_server_id,
    mesg,
    (opts.timeout ?? 30) * 1000,
  );
}

export async function handleSyncFsGetListing({
  path,
  hidden,
  compute_server_id,
}) {
  log("handleSyncFsGetListing: ", { path, hidden, compute_server_id });
  const mesg = { event: "listing", path, hidden };
  return await callComputeServerApi(compute_server_id, mesg, 15000);
}

export async function handleComputeServerFilesystemExec(opts) {
  const { compute_server_id } = opts;
  log("handleComputeServerFilesystemExec: ", opts);
  const mesg = { event: "exec", opts };
  return await callComputeServerApi(
    compute_server_id,
    mesg,
    (opts.timeout ?? 10) * 1000,
  );
}

export async function handleComputeServerDeleteFiles({
  compute_server_id,
  paths,
}) {
  log("handleComputeServerDeleteFiles: ", { compute_server_id, paths });
  const mesg = { event: "delete_files", paths };
  return await callComputeServerApi(compute_server_id, mesg, 60 * 1000);
}

export async function handleComputeServerRenameFile({
  compute_server_id,
  src,
  dest,
}) {
  log("handleComputeServerRenameFile: ", { compute_server_id, src, dest });
  const mesg = { event: "rename_file", src, dest };
  return await callComputeServerApi(compute_server_id, mesg, 60 * 1000);
}

export async function handleComputeServerMoveFiles({
  compute_server_id,
  paths,
  dest,
}) {
  log("handleComputeServerMoveFiles: ", { compute_server_id, paths, dest });
  const mesg = { event: "move_files", paths, dest };
  return await callComputeServerApi(compute_server_id, mesg, 60 * 1000);
}

/*
Similar but for compute instead of filesystem:
*/

const computeSparks: { [compute_server_id: number]: Spark } = {};

export async function handleComputeServerComputeRegister(
  { compute_server_id },
  spark,
) {
  log("handleComputeServerComputeRegister -- registering ", {
    compute_server_id,
    spark_id: spark.id,
  });
  // save the connection so we can send a sync_request message later, and also handle the api
  // calls for copying files back and forth, etc.
  computeSparks[compute_server_id] = spark;
  const remove = () => {
    if (computeSparks[compute_server_id]?.id == spark.id) {
      log(
        "handleComputeServerComputeRegister: removing compute server connection due to disconnect -- ",
        { compute_server_id, spark_id: spark.id },
      );
      // the spark connection currently cached is this
      // one, so we remove it. It could be replaced by
      // a new one, in which case we better not remove it.
      delete computeSparks[compute_server_id];
    }
  };
  spark.on("end", remove);
  spark.on("close", remove);
}

export async function handleComputeServerComputeExec(opts) {
  const { compute_server_id } = opts;
  log("handleComputeServerComputeExec: ", opts);
  const mesg = { event: "exec", opts };
  return await callComputeServerApi(
    compute_server_id,
    mesg,
    (opts.timeout ?? 10) * 1000,
    true,
  );
}
