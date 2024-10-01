/*

Find all threads that match a given collection of filters.

NOTE: chat uses every imaginable way to store a timestamp at once,
which is the may source of weirdness in the code below...  Beware.
*/

import type { ChatMessages, ChatMessageTyped, MessageHistory } from "./types";
import { search_match, search_split } from "@cocalc/util/misc";
import { List } from "immutable";
import type { TypedMap } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import LRU from "lru-cache";

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
  filter = filter?.trim();

  if (!(filter || (typeof filterRecentH === "number" && filterRecentH > 0))) {
    // no filters -- typical special case; waste now time.
    return messages;
  }
  const searchData = getSearchData(messages);
  let matchingRootTimes: Set<string>;
  if (filter) {
    matchingRootTimes = new Set<string>();
    const searchTerms = search_split(filter);
    for (const rootTime in searchData) {
      const { content } = searchData[rootTime];
      if (search_match(content, searchTerms)) {
        matchingRootTimes.add(rootTime);
      }
    }
  } else {
    matchingRootTimes = new Set(Object.keys(searchData));
  }
  if (typeof filterRecentH === "number" && filterRecentH > 0) {
    // remove anything from matchingRootTimes that doesn't match
    const now = webapp_client.server_time().getTime();
    const cutoff = now - filterRecentH * 1000 * 60 * 60;
    const x = new Set<string>();
    for (const rootTime of matchingRootTimes) {
      const { newestTime } = searchData[rootTime];
      if (newestTime >= cutoff) {
        x.add(rootTime);
      }
    }
    matchingRootTimes = x;
  }

  // Finally take all messages in all threads that have root in matchingRootTimes.
  // Return all messages in these threads
  // @ts-ignore -- immutable js typing seems wrong for filter
  const matchingThreads = messages.filter((message, time) => {
    const reply_to = message.get("reply_to"); // iso string if defined
    let rootTime: string;
    if (reply_to != null) {
      rootTime = `${new Date(reply_to).valueOf()}`;
    } else {
      rootTime = time;
    }
    return matchingRootTimes.has(rootTime);
  });

  return matchingThreads;
}

// NOTE: I removed search including send name, since that would
// be slower and of questionable value.  Maybe we want to add it back?
// A dropdown listing people might be better though, similar to the
// time filter.
function getContent(message: ChatMessageTyped): string {
  const first = message.get("history", List()).first() as
    | TypedMap<MessageHistory>
    | undefined;
  return first?.get("content") ?? "";
}

// Make a map
//     thread root timestamp --> {content:string; newest_message:Date}
// We can then use this to find the thread root timestamps that match the entire search

type SearchData = {
  // time in ms but as string
  // newestTime in ms as actual number (suitable to compare)
  [rootTime: string]: { content: string; newestTime: number };
};

const cache = new LRU<ChatMessages, SearchData>({ max: 25 });

function getSearchData(messages): SearchData {
  if (cache.has(messages)) {
    return cache.get(messages)!;
  }
  const data: SearchData = {};
  for (const [time, message] of messages) {
    let rootTime: string;
    if (message.get("reply_to")) {
      // non-root in thread
      rootTime = `${new Date(message.get("reply_to")).valueOf()}`;
    } else {
      // new root thread
      rootTime = time;
    }
    const messageTime = parseFloat(time);
    const content = getContent(message);
    if (data[rootTime] == null) {
      data[rootTime] = {
        content,
        newestTime: messageTime,
      };
    } else {
      data[rootTime].content += "\n" + content;
      if (data[rootTime].newestTime < messageTime) {
        data[rootTime].newestTime = messageTime;
      }
    }
  }
  cache.set(messages, data);
  return data;
}
