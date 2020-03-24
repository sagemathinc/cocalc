import { exec } from "./api";

// Delete the files/directories in the given project with the given list of paths.
export async function delete_files(
  paths: string[],
  logger: any
): Promise<void> {
  logger.debug(`delete_files ${JSON.stringify(paths)}`);
  await exec({
    command: "rm",
    timeout: 60,
    args: ["-rf", "--"].concat(paths)
  });
}
