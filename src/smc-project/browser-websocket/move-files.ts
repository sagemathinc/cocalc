import { move, pathExists } from "fs-extra";
import { path_split, hidden_meta_file } from "../smc-util/misc2";

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
  const HOME = home();
  src = HOME + "/" + src;
  dest = HOME + "/" + dest;
  logger.debug(`rename_file ${src} --> ${dest}`);
  await move(src, dest);
  const chat = chat_file(src);
  if (await pathExists(chat)) {
    const chat_target = chat_file(dest);
    logger.debug("rename_file chat exists so ${chat} --> ${chat_target}");
    await move(chat, chat_target);
  }
}
