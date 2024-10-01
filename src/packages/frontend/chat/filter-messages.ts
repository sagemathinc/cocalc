/*

Find all messages that match a given collection of filters.

*/

import type { ChatMessages, ChatMessageTyped, MessageHistory } from "./types";
import { search_match, search_split } from "@cocalc/util/misc";
import { List } from "immutable";
import type { TypedMap } from "@cocalc/frontend/app-framework";

export function filterMessages({
  messages,
  filter,
}: {
  // the messages to filter down
  messages: ChatMessages;
  filter?: string;
}) {
  if (filter) {
    const searchTerms = search_split(filter);
    messages = messages.filter((message) =>
      searchMatches(message, searchTerms),
    );
  }
  return messages;
}

// NOTE: I removed search including send name, since that would
// be slower and of questionable value.
export function searchMatches(message: ChatMessageTyped, searchTerms): boolean {
  const first = message.get("history", List()).first() as
    | TypedMap<MessageHistory>
    | undefined;
  if (first == null) return false;
  return search_match(first.get("content", ""), searchTerms);
}
