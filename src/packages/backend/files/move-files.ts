import { getHome } from "./util";
import { move, pathExists } from "fs-extra";
import { stat } from "node:fs/promises";
import { move_file_variations } from "@cocalc/util/delete-files";
import { path_split } from "@cocalc/util/misc";
import { join } from "path";
import getLogger from "@cocalc/backend/logger";

const log = getLogger("move-files");

export async function move_files(
  paths: string[],
  dest: string, // assumed to be a directory
  set_deleted: (path: string) => Promise<void>,
  home?: string,
): Promise<void> {
  const HOME = getHome(home);
  log.debug({ paths, dest });
  if (dest == "") {
    dest = HOME;
  } else if (!dest.startsWith("/")) {
    dest = join(HOME, dest);
  }
  if (!dest.endsWith("/")) {
    dest += "/";
  }
  const to_move: { src: string; dest: string }[] = [];
  for (let path of paths) {
    if (!path.startsWith("/")) {
      path = join(HOME, path);
    }
    const target = dest + path_split(path).tail;
    log.debug({ path, target });
    await set_deleted(path);
    to_move.push({ src: path, dest: target });

    // and the aux files:
    try {
      const s = await stat(path);
      if (!s.isDirectory()) {
        for (const variation of move_file_variations(path, target)) {
          if (await pathExists(variation.src)) {
            await set_deleted(variation.src);
            to_move.push(variation);
          }
        }
      }
    } catch (_err) {}
  }

  for (const x of to_move) {
    await move(x.src, x.dest);
  }
}
