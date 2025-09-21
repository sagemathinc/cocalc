import { execFile as execFile0 } from "node:child_process";
import { promisify } from "node:util";
import { cp, mkdtemp, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("file-server:ssh:build-container");

const execFile = promisify(execFile0);

const images = new Set<string>();

async function hasImage(name: string): Promise<boolean> {
  if (images.has(name)) {
    return true;
  }
  const { stdout } = await execFile("podman", [
    "image",
    "list",
    name,
    "--format",
    "json",
  ]);
  if (JSON.parse(stdout).length > 0) {
    images.add(name);
    logger.debug(`image ${name} exists`);
    return true;
  }
  return false;
}

// builds image if it does not exist
export const build = reuseInFlight(
  async ({
    Dockerfile,
    name,
    files,
  }: {
    Dockerfile: string;
    name: string;
    files?: string[];
  }) => {
    if (await hasImage(name)) {
      return;
    }
    logger.debug("Building image", { Dockerfile, name });
    let path: string | undefined = undefined;
    try {
      path = await mkdtemp(join(tmpdir(), "-cocalc"));
      logger.debug("Created temp dir:", path);
      if (files != null) {
        await Promise.all(files.map((x) => cp(x, join(path!, basename(x)))));
      }
      await writeFile(join(path, "Dockerfile"), Dockerfile, "utf8");
      const { stderr } = await execFile("podman", ["build", "-t", name, "."], {
        cwd: path,
      });
      if (!(await hasImage(name))) {
        throw Error(`failed to build image -- ${stderr}`);
      }
    } finally {
      if (path) {
        rm(path, { force: true, recursive: true });
      }
    }
  },
);
