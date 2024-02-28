import { getHome } from "./util";
import { move, pathExists } from "fs-extra";
import { stat } from "node:fs/promises";
import { move_file_variations } from "@cocalc/util/delete-files";
import { join } from "path";
import getLogger from "@cocalc/backend/logger";

const log = getLogger("rename-file");

export async function rename_file(
  src: string,
  dest: string,
  set_deleted: (path: string) => Promise<void>,
  home?: string,
): Promise<void> {
  if (src == dest) return; // no-op
  const HOME = getHome(home);
  if (!src.startsWith("/")) {
    src = join(HOME, src);
  }
  if (!dest.startsWith("/")) {
    dest = join(HOME, dest);
  }
  log.debug({ src, dest, home, HOME });
  await set_deleted(src); // todo: later may have a set_moved...
  const to_move: { src: string; dest: string }[] = [{ src, dest }];

  try {
    const s = await stat(src);
    if (!s.isDirectory()) {
      for (const variation of move_file_variations(src, dest)) {
        if (await pathExists(variation.src)) {
          await set_deleted(variation.src);
          to_move.push(variation);
        }
      }
    }
  } catch (_err) {}

  for (const x of to_move) {
    await move(x.src, x.dest);
  }
}
