/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { getHome } from "./util";
import { deleted_file_variations } from "@cocalc/util/delete-files";
import { rimraf } from "rimraf";
import { join } from "path";
import getLogger from "@cocalc/backend/logger";

const log = getLogger("delete-files");

// Delete the files/directories in the given project with the given list of paths.
export async function delete_files(
  paths: string[],
  home?: string,
): Promise<void> {
  const HOME = getHome(home);
  log.debug({ paths, HOME });
  paths = paths.map((x) => (x.startsWith("/") ? x : join(HOME, x)));
  // Add in all the hidden variants.
  let extra: string[] = [];
  for (const path of paths) {
    for (const variation of deleted_file_variations(path)) {
      extra.push(variation);
    }
  }
  // Actually delete the files and directories and any hidden variants.
  // This is just simply deleting the files from disk.  It will get noticed
  // by browser clients, etc.   We could do stuff that is way more clever here
  // involving the listings table... but:
  //    - that results in weird race conditions that can make files immediately
  //      reappear after deletion
  //    - we MUST make deletion detection fully work based entirely on what happens
  //      on the file system, e.g., due to git checkout and people using the terminal
  log.debug("extra = ", extra);
  await rimraf(paths.concat(extra), { maxRetries: 2 });
}
