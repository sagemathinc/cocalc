import { filename_extension, hidden_meta_file } from "@cocalc/util/misc";

export const CHAT_FILE_EXTENSIONS = ["chat", "sage-chat"] as const;

export function isChatExtension(ext?: string | null): boolean {
  if (!ext) return false;
  const lower = ext.toLowerCase();
  return CHAT_FILE_EXTENSIONS.includes(
    lower as (typeof CHAT_FILE_EXTENSIONS)[number],
  );
}

export function isChatPath(path?: string | null): boolean {
  if (!path) return false;
  return isChatExtension(filename_extension(path));
}

export function chatMetaFile(path: string): string {
  const ext = filename_extension(path);
  if (isChatExtension(ext)) {
    return hidden_meta_file(path, ext.toLowerCase());
  }
  // Default to the legacy extension for side-chats to preserve existing data.
  const legacy = CHAT_FILE_EXTENSIONS.find((e) => e === "sage-chat");
  const chatExt = legacy ?? CHAT_FILE_EXTENSIONS[0];
  return hidden_meta_file(path, chatExt);
}
