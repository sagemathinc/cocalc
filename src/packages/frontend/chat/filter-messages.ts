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
  let messages0 = messages;
  if (filter) {
    const searchTerms = search_split(filter);
    messages0 = messages0.filter((message) =>
      searchMatches(message, searchTerms),
    );
  }

  if (typeof filterRecentH === "number" && filterRecentH > 0) {
    const now = webapp_client.server_time().getTime();
    const cutoff = now - filterRecentH * 1000 * 60 * 60;
    messages0 = messages0.filter((message) => {
      const date = message.get("date").getTime();
      return date >= cutoff;
    });
  }

  if (messages0.size == 0) {
    // nothing matches
    return messages0;
  }

  // Next, we expand to include all threads containing any matching messages.
  // First find the roots of all matching threads:
  const roots = new Set<string>();
  for (const [_, message] of messages0) {
    roots.add(message.get("reply_to") ?? message.get("date").toISOString());
  }
  // Return all messages in these threads
  return messages.filter((message) => roots.has(message.get("reply_to") ?? message.get("date").toISOString()));
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
