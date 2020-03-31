import { move, pathExists } from "fs-extra";
import { stat } from "fs";
import { path_split, hidden_meta_file } from "../smc-util/misc2";
import { get_listings_table } from "../sync/listings";
import { callback } from "awaiting";
import { move_file_variations } from "../smc-util/delete-files";

function chat_file(path: string): string {
  return hidden_meta_file(path, "sage-chat");
}

function home(): string {
  const { HOME } = process.env;
  if (HOME == null) throw Error("HOME must be defined");
  return HOME;
}

export async function move_files(
  paths: string[],
  dest: string, // assumed to be a directory
  logger: any
): Promise<void> {
  const HOME = home();
  logger.debug(`move_files ${JSON.stringify(paths)} --> ${dest}`);
  if (dest == "") {
    dest = HOME;
  } else {
    dest = HOME + "/" + dest;
  }
  dest += "/";
  for (let path of paths) {
    path = HOME + "/" + path;
    const target = dest + path_split(path).tail;
    logger.debug(`move_file ${path} --> ${target}`);
    await move(path, target);
    const chat = chat_file(path);
    logger.debug(`move_file chat=${chat}`);
    if (await pathExists(chat)) {
      const chat_target = dest + path_split(chat).tail;
      logger.debug(`move_file chat exists so ${chat} --> ${chat_target}`);
      await move(chat, chat_target);
    }
  }
}

export async function rename_file(
  src: string,
  dest: string,
  logger: any
): Promise<void> {
  if (src == dest) return; // no-op
  const HOME = home();
  src = HOME + "/" + src;
  dest = HOME + "/" + dest;
  logger.debug(`rename_file ${src} --> ${dest}`);
  const listings = get_listings_table();
  await listings?.set_deleted(src); // todo: later may have a set_moved...
  const to_move: { src: string; dest: string }[] = [{ src, dest }];

  try {
    const s = await callback(stat, src);
    if (!s.isDirectory()) {
      for (const variation of move_file_variations(src, dest)) {
        if (await pathExists(variation.src)) {
          await listings?.set_deleted(variation.src);
          to_move.push(variation);
        }
      }
    }
  } catch (_err) {}

  for (const x of to_move) {
    await move(x.src, x.dest);
  }
}
