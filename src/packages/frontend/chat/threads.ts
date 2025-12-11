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
  rootMessage?: ChatMessageTyped;
}

export type ThreadSectionKey =
  | "pinned"
  | "today"
  | "yesterday"
  | "last7days"
  | "older";

export interface ThreadSection<T extends ThreadListItem = ThreadListItem> {
  key: ThreadSectionKey;
  title: string;
  threads: T[];
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
        rootMessage: entry.rootMessage,
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
  const explicitName = rootMessage?.get("name") as string | undefined;
  if (typeof explicitName === "string") {
    const trimmed = explicitName.trim();
    if (trimmed) {
      return trimmed;
    }
  }
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

const DAY_MS = 24 * 60 * 60 * 1000;

interface GroupOptions {
  now?: number;
}

type RecencyKey = Exclude<ThreadSectionKey, "pinned">;

const RECENCY_SECTIONS: { key: RecencyKey; title: string }[] = [
  { key: "today", title: "Today" },
  { key: "yesterday", title: "Yesterday" },
  { key: "last7days", title: "Last 7 Days" },
  { key: "older", title: "Older" },
];

function recencyKeyForDelta(delta: number): RecencyKey {
  if (delta < DAY_MS) {
    return "today";
  }
  if (delta < 2 * DAY_MS) {
    return "yesterday";
  }
  if (delta < 7 * DAY_MS) {
    return "last7days";
  }
  return "older";
}

export function groupThreadsByRecency<T extends ThreadListItem & { isPinned?: boolean }>(
  threads: T[],
  options: GroupOptions = {},
): ThreadSection<T>[] {
  if (!threads || threads.length === 0) {
    return [];
  }
  const now = options.now ?? Date.now();
  const sections: ThreadSection<T>[] = [];
  const pinned = threads.filter((thread) => !!thread.isPinned);
  const remainder = threads.filter((thread) => !thread.isPinned);
  if (pinned.length > 0) {
    sections.push({ key: "pinned", title: "Pinned", threads: pinned });
  }
  const buckets: Record<RecencyKey, T[]> = {
    today: [],
    yesterday: [],
    last7days: [],
    older: [],
  };
  for (const thread of remainder) {
    const delta = now - thread.newestTime;
    const key = recencyKeyForDelta(delta);
    buckets[key].push(thread);
  }
  for (const def of RECENCY_SECTIONS) {
    const list = buckets[def.key];
    if (list.length > 0) {
      sections.push({ key: def.key, title: def.title, threads: list });
    }
  }
  return sections;
}
