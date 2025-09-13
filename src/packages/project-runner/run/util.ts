import { join } from "node:path";
import { copyFile, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { packageDirectory } from "package-directory";
import getLogger from "@cocalc/backend/logger";
import { dataPath, secretTokenPath } from "./env";
import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";

const logger = getLogger("project-runner:util");

let root: string | undefined = undefined;
export async function ensureConfFilesExists(HOME: string): Promise<void> {
  root ??= await packageDirectory({ cwd: __dirname });
  if (!root) {
    throw Error("unable to determine package root");
  }
  for (const path of ["bashrc", "bash_profile"]) {
    const target = join(HOME, `.${path}`);
    try {
      await stat(target);
    } catch (_) {
      // file does NOT exist, so create
      const source = join(root, "templates", process.platform, path);
      try {
        await copyFile(source, target);
      } catch (err) {
        logger.error(`ensureConfFilesExists -- ${err}`);
      }
    }
  }
}

export async function setupDataPath(HOME: string): Promise<void> {
  const data = dataPath(HOME);
  logger.debug(`setup "${data}"...`);
  await rm(data, { recursive: true, force: true });
  await mkdir(data, { recursive: true });
}

export async function writeSecretToken(
  HOME: string,
  secretToken: string,
): Promise<void> {
  const path = secretTokenPath(HOME);
  await ensureContainingDirectoryExists(path);
  await writeFile(path, secretToken);
}
