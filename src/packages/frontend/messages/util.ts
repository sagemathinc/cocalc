import type { Message } from "@cocalc/util/db-schema/messages";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { iThreads, iMessage } from "./types";

//       WARNING: If you change or add fields and logic that could impact the "number of
// messages in the inbox that are not read", make sure to also update
//  packages/database/postgres/messages.ts

export function isInFolderThreaded({
  message,
  threads,
  folder,
}: {
  message: iMessage;
  threads: iThreads;
  folder: "inbox" | "sent" | "all" | "trash";
}) {
  const thread_id = message.get("thread_id");
  if (thread_id == null) {
    // not a thread
    return isInFolderNotThreaded({ message, folder });
  } else {
    // a message is in a folder if some message in the thread is in that folder.
    const thread = threads.get(thread_id);
    if (thread == null) {
      // data not fully loaded yet -- so use best fallback
      return isInFolderNotThreaded({ message, folder });
    }
    if (folder == "inbox" || folder == "sent") {
      // inbox = at least one message in the thread is in inbox
      // sent = at least one message was sent by us
      for (const message of thread) {
        if (isInFolderNotThreaded({ message, folder })) {
          return true;
        }
      }
      return false;
    }
    if (folder == "trash") {
      // trash = every message in thread that we received is in trash
      for (const message of thread) {
        if (
          message.get("to_id") == webapp_client.account_id &&
          !isInFolderNotThreaded({ message, folder })
        ) {
          return false;
        }
      }
      return true;
    }
    if (folder == "all") {
      // all = same as not being in trash
      return !isInFolderThreaded({ message, threads, folder: "trash" });
    }
    return true;
  }
}

function isInFolderNotThreaded({
  message,
  folder,
}: {
  message: iMessage;
  folder: "inbox" | "sent" | "all" | "trash";
}) {
  if (folder == "sent") {
    return (
      message.get("from_type") == "account" &&
      message.get("from_id") == webapp_client.account_id
    );
  }
  const toMe =
    message.get("to_type") == "account" &&
    message.get("to_id") == webapp_client.account_id;
  if (!toMe) {
    return false;
  }
  if (folder == "inbox") {
    return !message.get("saved") && !message.get("deleted");
  }
  if (folder == "trash") {
    return message.get("deleted");
  }
  if (folder == "all") {
    return !message.get("deleted");
  }
}

export function isRead(message: Message) {
  return !isNullDate(message.read);
}

export function isNullDate(date: Date | number | undefined | null): boolean {
  return date == null || new Date(date).valueOf() == 0;
}

export function isFromMe(message?: Message): boolean {
  return (
    message?.from_type == "account" &&
    message?.from_id == webapp_client.account_id
  );
}

export function isToMe(message?: Message): boolean {
  return (
    message?.to_type == "account" && message?.to_id == webapp_client.account_id
  );
}

// returns new set that has all the ids in all threads that intersect ids.
// or if threads is null, returns ids. Does not mutate ids.
export function expandToThreads({
  ids,
  threads,
  messages,
}: {
  ids: Set<number>;
  threads: iThreads | null;
  messages; //immutable js map from id to message
}): Set<number> {
  if (threads == null || messages == null) {
    return ids;
  }
  const expanded = new Set<number>();
  for (const id of ids) {
    const thread_id = messages.getIn([id, "thread_id"]) ?? id;
    for (const message of (threads.get(thread_id)?.toJS() as any) ?? [{ id }]) {
      expanded.add(message.id);
    }
  }
  return expanded;
}
