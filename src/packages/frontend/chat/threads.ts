/*
Utility helpers for deriving thread metadata from the chat message list.
*/

import { React, redux, useRedux } from "@cocalc/frontend/app-framework";
import { chatFile } from "@cocalc/frontend/frame-editors/generic/chat";

import type { ChatMessageTyped, ChatMessages } from "./types";
import { anchorIdOf, formerAnchorIdOf, newest_content } from "./utils";

export const ALL_THREADS_KEY = "__ALL_THREADS__";

export interface ThreadListItem {
  key: string;
  label: string;
  newestTime: number;
  messageCount: number;
  // number of messages after the lastread timestamp for the given account
  unreadCount: number;
  // the lastread timestamp (ms epoch) for the given account, if set
  lastReadTimestamp: number | undefined;
  rootMessage?: ChatMessageTyped;
  // True iff the root message has been marked resolved (LaTeX
  // collaborative-TODO flow). Resolved threads are excluded from the
  // main list and shown in a separate "Resolved" section.
  resolved?: boolean;
  // ms-epoch when the thread was resolved, if known.
  resolvedAt?: number;
}

export type ThreadSectionKey =
  | "pinned"
  | "today"
  | "yesterday"
  | "last7days"
  | "older"
  | "resolved";

export interface ThreadSection<T extends ThreadListItem = ThreadListItem> {
  key: ThreadSectionKey;
  title: string;
  threads: T[];
}

export function useThreadList(
  messages?: ChatMessages,
  account_id?: string,
): ThreadListItem[] {
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
        messageDates: number[];
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
          messageDates: [],
        };
        threads.set(rootKey, thread);
      }
      thread.messageCount += 1;
      const dateValue = message.get("date")?.valueOf();
      if (dateValue != null) {
        thread.messageDates.push(dateValue);
        if (dateValue > thread.newestTime) {
          thread.newestTime = dateValue;
        }
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
      // compute unread count based on lastread timestamp
      let lastReadTimestamp: number | undefined;
      let unreadCount = 0;
      if (account_id && entry.rootMessage) {
        const val = entry.rootMessage.get(`lastread-${account_id}`);
        if (typeof val === "number" && val > 0) {
          lastReadTimestamp = val;
        } else if (typeof val === "string") {
          const n = parseInt(val, 10);
          if (Number.isFinite(n) && n > 0) {
            lastReadTimestamp = n;
          }
        }
        if (lastReadTimestamp != null) {
          unreadCount = entry.messageDates.filter(
            (d) => d > lastReadTimestamp!,
          ).length;
        } else {
          // no lastread set — fall back to count-based for backward compat
          const readField = entry.rootMessage.get(`read-${account_id}`);
          const readValue =
            typeof readField === "number"
              ? readField
              : typeof readField === "string"
                ? parseInt(readField, 10)
                : 0;
          const readCount =
            Number.isFinite(readValue) && readValue > 0 ? readValue : 0;
          unreadCount = Math.max(entry.messageCount - readCount, 0);
        }
      }
      const resolvedRaw = entry.rootMessage?.get("resolved");
      const resolved = resolvedRaw != null;
      let resolvedAt: number | undefined;
      if (resolved) {
        const atRaw =
          typeof (resolvedRaw as any).get === "function"
            ? (resolvedRaw as any).get("at")
            : (resolvedRaw as any).at;
        if (typeof atRaw === "string") {
          const parsed = Date.parse(atRaw);
          if (Number.isFinite(parsed)) resolvedAt = parsed;
        }
      }
      items.push({
        key: entry.key,
        label: deriveThreadLabel(entry.rootMessage, entry.key),
        newestTime: entry.newestTime,
        messageCount: entry.messageCount,
        unreadCount,
        lastReadTimestamp,
        rootMessage: entry.rootMessage,
        resolved,
        resolvedAt,
      });
    }

    items.sort((a, b) => b.newestTime - a.newestTime);
    return items;
  }, [messages, account_id]);
}

/**
 * Filter threads down to those *actively* anchored at the given id. An
 * "anchor" is a source-document location (jupyter cell UUID, LaTeX marker
 * hash, etc.) that an editor associates with a thread by stamping `id` on
 * the root message. Resolved threads are excluded — see
 * `useResolvedAnchoredThreads` for those.
 */
export function useAnchoredThreads(
  project_id: string,
  path: string,
  anchorId: string,
): {
  anchoredThreads: ThreadListItem[];
  totalMessages: number;
  totalUnread: number;
} {
  const account_id = redux.getStore("account")?.get_account_id();
  const chatPath = chatFile(path);
  const chatMessages = useRedux(["messages"], project_id, chatPath);
  const allThreads = useThreadList(chatMessages, account_id);
  const anchoredThreads = React.useMemo(
    () => allThreads.filter((t) => anchorIdOf(t.rootMessage) === anchorId),
    [allThreads, anchorId],
  );
  const totalMessages = React.useMemo(
    () => anchoredThreads.reduce((s, t) => s + t.messageCount, 0),
    [anchoredThreads],
  );
  const totalUnread = React.useMemo(
    () => anchoredThreads.reduce((s, t) => s + t.unreadCount, 0),
    [anchoredThreads],
  );
  return { anchoredThreads, totalMessages, totalUnread };
}

/**
 * Threads whose root message is *resolved* AND whose former anchor matches
 * `anchorId`. Used by stale-marker rendering: a `% chat: <hash>` marker in
 * the source whose hash matches a resolved thread is "stale" — the
 * conversation is over, and the marker is leftover (typically because it
 * lived in a sub-file that wasn't open at resolve time). Returns
 * `hasResolved: true` so callers can decide rendering without iterating.
 */
export function useResolvedAnchoredThreads(
  project_id: string,
  path: string,
  anchorId: string,
): {
  resolvedThreads: ThreadListItem[];
  hasResolved: boolean;
} {
  const account_id = redux.getStore("account")?.get_account_id();
  const chatPath = chatFile(path);
  const chatMessages = useRedux(["messages"], project_id, chatPath);
  const allThreads = useThreadList(chatMessages, account_id);
  const resolvedThreads = React.useMemo(
    () =>
      allThreads.filter(
        (t) => t.resolved && formerAnchorIdOf(t.rootMessage) === anchorId,
      ),
    [allThreads, anchorId],
  );
  return {
    resolvedThreads,
    hasResolved: resolvedThreads.length > 0,
  };
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

interface GroupOptions {
  now?: number;
}

type RecencyKey = Exclude<ThreadSectionKey, "pinned" | "resolved">;

const RECENCY_SECTIONS: { key: RecencyKey; title: string }[] = [
  { key: "today", title: "Today" },
  { key: "yesterday", title: "Yesterday" },
  { key: "last7days", title: "Last 7 Days" },
  { key: "older", title: "Older" },
];

function recencyKeyForTime(threadTime: number, now: number): RecencyKey {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  if (threadTime >= startOfToday.getTime()) return "today";
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  if (threadTime >= startOfYesterday.getTime()) return "yesterday";
  const startOf7DaysAgo = new Date(startOfToday);
  startOf7DaysAgo.setDate(startOf7DaysAgo.getDate() - 6);
  if (threadTime >= startOf7DaysAgo.getTime()) return "last7days";
  return "older";
}

export function groupThreadsByRecency<
  T extends ThreadListItem & { isPinned?: boolean },
>(threads: T[], options: GroupOptions = {}): ThreadSection<T>[] {
  if (!threads || threads.length === 0) {
    return [];
  }
  const now = options.now ?? Date.now();
  const sections: ThreadSection<T>[] = [];
  // Resolved threads are pulled out and shown in their own section at the
  // very bottom — never pinned/today/etc., never affecting recency
  // counts. The chatroom dims them visually.
  const resolved = threads.filter((thread) => thread.resolved);
  const live = threads.filter((thread) => !thread.resolved);
  const pinned = live.filter((thread) => !!thread.isPinned);
  const remainder = live.filter((thread) => !thread.isPinned);
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
    const key = recencyKeyForTime(thread.newestTime, now);
    buckets[key].push(thread);
  }
  for (const def of RECENCY_SECTIONS) {
    const list = buckets[def.key];
    if (list.length > 0) {
      sections.push({ key: def.key, title: def.title, threads: list });
    }
  }
  if (resolved.length > 0) {
    // Resolved threads sort newest-resolved first so the most recently
    // closed TODO is visible without expanding too far.
    const sortedResolved = [...resolved].sort(
      (a, b) => (b.resolvedAt ?? 0) - (a.resolvedAt ?? 0),
    );
    sections.push({
      key: "resolved",
      title: "Resolved",
      threads: sortedResolved,
    });
  }
  return sections;
}
