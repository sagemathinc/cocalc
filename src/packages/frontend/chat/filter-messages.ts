/*

Find all messages that match a given collection of filters.

*/

import type { ChatMessages, ChatMessageTyped, MessageHistory } from "./types";
import { search_match, search_split } from "@cocalc/util/misc";
import { List } from "immutable";
import type { TypedMap } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";

export function filterMessages({
  messages,
  filter,
  filterRecentH,
}: {
  // the messages to filter down
  messages: ChatMessages;
  filter?: string;
  filterRecentH?: number;
}) {
  if (filter) {
    const searchTerms = search_split(filter);
    messages = messages.filter((message) =>
      searchMatches(message, searchTerms),
    );
  }

  if (typeof filterRecentH === "number" && filterRecentH > 0) {
    const now = webapp_client.server_time().getTime();
    const cutoff = now - filterRecentH * 1000 * 60 * 60;
    messages = messages.filter((msg) => {
      const date = msg.get("date").getTime();
      return date >= cutoff;
    });
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
