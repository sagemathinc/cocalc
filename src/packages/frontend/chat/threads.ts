/*
Utility helpers for deriving thread metadata from the chat message list.
*/

import { React } from "@cocalc/frontend/app-framework";

import type { ChatMessageTyped, ChatMessages } from "./types";
import { newest_content } from "./utils";

export const ALL_THREADS_KEY = "__ALL_THREADS__";

export interface ThreadListItem {
  key: string;
  label: string;
  newestTime: number;
  messageCount: number;
}

export function useThreadList(messages?: ChatMessages): ThreadListItem[] {
  return React.useMemo(() => {
    if (messages == null || messages.size === 0) {
      return [];
    }

    const threads = new Map<
      string,
      {
        key: string;
        newestTime: number;
        messageCount: number;
        rootMessage?: ChatMessageTyped;
      }
    >();

    for (const [timeRaw, message] of messages) {
      if (message == null) continue;
      const timeString =
        typeof timeRaw === "string" ? timeRaw : `${timeRaw ?? ""}`;
      const replyTo = message.get("reply_to");
      const rootKey = replyTo ? `${new Date(replyTo).valueOf()}` : timeString;
      let thread = threads.get(rootKey);
      if (thread == null) {
        thread = {
          key: rootKey,
          newestTime: 0,
          messageCount: 0,
        };
        threads.set(rootKey, thread);
      }
      thread.messageCount += 1;
      const dateValue = message.get("date")?.valueOf();
      if (dateValue != null && dateValue > thread.newestTime) {
        thread.newestTime = dateValue;
      }
      if (!replyTo) {
        thread.rootMessage = message;
      }
    }

    const items: ThreadListItem[] = [];
    for (const entry of threads.values()) {
      if (entry.rootMessage == null) {
        const maybeRoot = messages.get(entry.key);
        if (maybeRoot) {
          entry.rootMessage = maybeRoot;
        }
      }
      items.push({
        key: entry.key,
        label: deriveThreadLabel(entry.rootMessage, entry.key),
        newestTime: entry.newestTime,
        messageCount: entry.messageCount,
      });
    }

    items.sort((a, b) => b.newestTime - a.newestTime);
    return items;
  }, [messages]);
}

export function deriveThreadLabel(
  rootMessage: ChatMessageTyped | undefined,
  fallbackKey: string,
): string {
  const content = rootMessage ? newest_content(rootMessage) : "";
  const normalized = content.replace(/\s+/g, " ").trim();
  if (normalized) {
    const words = normalized.split(" ");
    const short = words.slice(0, 8).join(" ");
    return words.length > 8 ? `${short}…` : short;
  }
  const timestamp = parseInt(fallbackKey);
  if (!isNaN(timestamp)) {
    return new Date(timestamp).toLocaleString();
  }
  return "Untitled Thread";
}
