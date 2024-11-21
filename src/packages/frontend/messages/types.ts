import type { TypedMap } from "@cocalc/util/types/typed-map";
import { List, Map } from "immutable";

import type { Message } from "@cocalc/util/db-schema/messages";
export type iMessage = TypedMap<Message>;
export type iMessagesMap = Map<number, TypedMap<Message>>;
export type iThreads = Map<number, List<TypedMap<Message>>>;

export type Folder = "inbox" | "sent" | "all" | "trash";
export function isFolder(folder: string): folder is Folder {
  return (
    folder == "inbox" ||
    folder == "sent" ||
    folder == "all" ||
    folder == "trash"
  );
}
