/*
This is used by src/compute/compute/lib/filesystem-cache.
*/

import { join } from "path";
import { open /*, rm */ } from "fs/promises";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import type { ComputeFilesystemOptions } from "@cocalc/comm/websocket/types";

export default async function computeFilesystemCache(
  opts: ComputeFilesystemOptions,
) {
  switch (opts.func) {
    case "filesToDelete":
      return await filesToDelete(opts.allComputeFiles);
    default:
      throw Error(`unknown command ${opts.func}`);
  }
}

// Given a path to a file that contains a list (one per line)
// of the files and on the compute server that are sync'd,
// return the ones that should be deleted from the compute server,
// because they were deleted locally.
async function filesToDelete(allComputeFiles: string) {
  if (typeof allComputeFiles != "string") {
    throw Error(
      "filesToDelete takes the path to list of all files in the compute server as input",
    );
  }
  if (!process.env.HOME) {
    throw Error("HOME must be defined");
  }
  const file = await open(join(process.env.HOME, allComputeFiles));
  const toDelete: string[] = [];
  for await (const path of file.readLines()) {
    const abspath = join(process.env.HOME, path);
    if (!(await exists(abspath))) {
      toDelete.push(path);
    }
  }
  await file.close();
  return toDelete;
}
