import type { TypedMap } from "@cocalc/util/types/typed-map";
import { List, Map } from "immutable";

import type { Message } from "@cocalc/util/db-schema/messages";
export type { Message };
export type iMessage = TypedMap<Message>;
export type iMessagesMap = Map<number, TypedMap<Message>>;
export type iThreads = Map<number, List<TypedMap<Message>>>;

export type Filter =
  | "messages-inbox"
  | "messages-sent"
  | "messages-all"
  | "messages-trash"
  | "messages-starred"
  | "messages-liked"
  | "messages-search"
  | "messages-drafts";

export function isMessagesFilter(filter: string): filter is Filter {
  return (
    filter == "messages-inbox" ||
    filter == "messages-sent" ||
    filter == "messages-all" ||
    filter == "messages-trash" ||
    filter == "messages-starred" ||
    filter == "messages-liked" ||
    filter == "messages-search" ||
    filter == "messages-drafts"
  );
}

export type Folder =
  | "inbox"
  | "sent"
  | "all"
  | "trash"
  | "search"
  | "drafts"
  | "starred"
  | "liked";

export function isFolder(folder: string): folder is Folder {
  return (
    folder == "inbox" ||
    folder == "sent" ||
    folder == "all" ||
    folder == "trash" ||
    folder == "search" ||
    folder == "drafts" ||
    folder == "starred" ||
    folder == "liked"
  );
}
