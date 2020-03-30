import { stat } from "fs";
import { callback } from "awaiting";

import { exec } from "./api";
import { get_listings_table } from "../sync/listings";
import { deleted_file_variations } from "../smc-util/delete-files";
import { pathExists } from "fs-extra";

// Delete the files/directories in the given project with the given list of paths.
export async function delete_files(
  paths: string[],
  logger: any
): Promise<void> {
  logger.debug(`delete_files ${JSON.stringify(paths)}`);
  // Update the listings table to record that these were deleted.
  const listings = get_listings_table();
  if (listings != null) {
    for (const path of paths) {
      await listings.set_deleted(path);
    }
  }

  // For each path that exists and is not a directory,
  // add in all the hidden variants.
  let extra: string[] = [];
  for (const path of paths) {
    try {
      const s = await callback(stat, path);
      if (!s.isDirectory()) {
        for (const variation of deleted_file_variations(path)) {
          if (await pathExists(variation)) {
            if (listings != null) {
              await listings.set_deleted(variation);
            }
            extra.push(variation);
          }
        }
      }
    } catch (_err) {}
  }

  // Actually delete the files and directories and any hidden variants
  await exec({
    command: "rm",
    timeout: 60,
    args: ["-rf", "--"].concat(paths).concat(extra),
  });
}
