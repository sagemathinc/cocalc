import { copyFile, writeFile } from "fs/promises";
import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { platform } from "os";
import { filename_extension } from "@cocalc/util/misc";
import { root } from "@cocalc/backend/data";
import { join } from "path";

export async function newFile(path: string) {
  if (!process.env.HOME) {
    throw Error("HOME must be set");
  }
  if (!path) {
    return;
  }
  path = path.startsWith("/") ? path : join(process.env.HOME, path);

  if (await exists(path)) {
    return;
  }

  await ensureContainingDirectoryExists(path);
  const ext = filename_extension(path);
  const PLATFORM = platform().toLowerCase();

  for (const place of [
    process.env.HOME,
    join(root, "smc_pyutil", "smc_pyutil"),
  ]) {
    const template = join(place, "templates", PLATFORM, "default." + ext);
    if (await exists(template)) {
      await copyFile(template, path);
      return;
    }
  }
  await writeFile(path, "");
}
