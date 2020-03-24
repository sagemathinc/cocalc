import { exec } from "./api";
import { get_listings_table } from "../sync/listings";

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
      listings.set_deleted(path);
    }
  }
  // Actually delete the files and directories
  await exec({
    command: "rm",
    timeout: 60,
    args: ["-rf", "--"].concat(paths)
  });
}
