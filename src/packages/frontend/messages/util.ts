import type { Message } from "@cocalc/util/db-schema/messages";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { iThreads } from "./types";

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
  sentMessages,
}: {
  ids: Set<number>;
  threads: iThreads | null;
  messages; //immutable js map from id to message
  sentMessages;
}): Set<number> {
  if (threads == null || messages == null || sentMessages == null) {
    return ids;
  }
  const expanded = new Set<number>();
  for (const id of ids) {
    const thread_id =
      messages.getIn([id, "thread_id"]) ??
      sentMessages.getIn([id, "thread_id"]) ??
      id;
    for (const message of (threads.get(thread_id)?.toJS() as any) ?? [{ id }]) {
      expanded.add(message.id);
    }
  }
  return expanded;
}
