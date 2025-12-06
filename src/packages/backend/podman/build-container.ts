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

async function hasImage(name: string, sudo = false): Promise<boolean> {
  const key = `${sudo ? "root" : "user"}:${name}`;
  if (images.has(key)) {
    return true;
  }
  const { stdout } = await execFile(
    sudo ? "sudo" : "podman",
    [
      ...(sudo ? ["podman"] : []),
      "image",
      "list",
      name,
      "--format",
      "json",
    ],
  );
  if (JSON.parse(stdout).length > 0) {
    images.add(key);
    logger.debug(`image ${name} now exists`);
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
    fileContents,
    sudo = false,
  }: {
    Dockerfile: string;
    name: string;
    files?: string[];
    fileContents?: { [path: string]: string };
    sudo?: boolean;
  }) => {
    if (await hasImage(name, sudo)) {
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
      if (fileContents != null) {
        const v: any[] = [];
        for (const x in fileContents) {
          v.push(writeFile(join(path, x), fileContents[x]));
        }
        await Promise.all(v);
      }
      await writeFile(join(path, "Dockerfile"), Dockerfile, "utf8");
      const { stderr } = await execFile(
        sudo ? "sudo" : "podman",
        [...(sudo ? ["podman"] : []), "build", "-t", name, "."],
        {
          cwd: path,
        },
      );
      if (!(await hasImage(name, sudo))) {
        throw Error(`failed to build image -- ${stderr}`);
      }
    } finally {
      if (path) {
        rm(path, { force: true, recursive: true });
      }
    }
  },
);
