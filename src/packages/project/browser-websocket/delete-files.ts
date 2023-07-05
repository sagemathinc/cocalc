/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { exec } from "./api";
import { deleted_file_variations } from "@cocalc/util/delete-files";
import { getLogger } from "@cocalc/project/logger";

const log = getLogger("delete-files");

// Delete the files/directories in the given project with the given list of paths.
export async function delete_files(paths: string[]): Promise<void> {
  log.debug(paths);
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
  //      on the filesystem, e.g., due to git checkout and people using the terminal
  log.debug("extra = ", extra);
  await exec({
    command: "rm",
    timeout: 60,
    args: ["-rf", "--"].concat(paths).concat(extra),
  });
}
