import {
  getBitPosition as getBitPosition0,
  type Message,
} from "@cocalc/util/db-schema/messages";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { iThreads, iMessage, iMessagesMap, Folder } from "./types";
import { cmp } from "@cocalc/util/misc";
import Fragment from "@cocalc/frontend/misc/fragment-id";
import { Map as iMap, List as iList } from "immutable";
import { SCHEMA } from "@cocalc/util/schema";

type Mesg = iMessage | Message;

// WARNING: If you change or add fields and logic that could impact the "number of
// messages in the inbox that are not read", make sure to also update
//  packages/database/postgres/messages.ts

export function isInFolderThreaded({
  message,
  threads,
  folder,
  search,
}: {
  message: Mesg;
  threads: iThreads;
  folder: Folder;
  search?: Set<number>;
}) {
  const thread_id = get(message, "thread_id");
  if (!thread_id) {
    // not a thread
    return isInFolderNotThreaded({ message, folder, search });
  } else {
    if (folder == "search" && (!search || search.size == 0)) {
      return false;
    }
    // a message is in a folder if some message in the thread is in that folder.
    const thread = threads.get(thread_id);
    if (thread == null) {
      // data not fully loaded yet -- so use best fallback
      return isInFolderNotThreaded({ message, folder, search });
    }

    // eliminate any thread with an expired message from ALL folders,
    for (const message of thread) {
      if (isExpired(message)) {
        return false;
      }
    }

    if (
      folder == "inbox" ||
      folder == "sent" ||
      folder == "drafts" ||
      folder == "search" ||
      folder == "starred" ||
      folder == "liked"
    ) {
      // inbox = at least one message in the thread is in inbox
      // sent = at least one message was sent by us
      // starred = at least one message in thread is starred
      for (const message of thread) {
        if (isInFolderNotThreaded({ message, folder, search })) {
          return true;
        }
      }
      return false;
    }
    if (folder == "trash") {
      // trash = every message in thread that we received is in trash
      // (expect expire when it's just gone or about to be)
      for (const message of thread) {
        if (!isDeleted(message)) {
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

export function isExpired(message: Mesg) {
  return getBitField(message, "expire");
}

export function isDeleted(message: Mesg) {
  return getBitField(message, "deleted");
}

function isInFolderNotThreaded({
  message,
  folder,
  search,
}: {
  message: Mesg;
  folder: Folder;
  search?: Set<number>;
}) {
  if (isExpired(message)) {
    // gone (or will be very soon)
    return false;
  }

  if (folder == "search") {
    if (!search) {
      return false;
    }
    return search.has(get(message, "id"));
  }

  // trash folder is exactly the deleted messages:
  const deleted = isDeleted(message);
  if (folder == "trash") {
    return deleted;
  }
  if (deleted) {
    return false;
  }

  if (folder == "starred") {
    return isStarred(message);
  }
  if (folder == "liked") {
    return isLiked(message);
  }

  const draft = isDraft(message);

  if (folder == "drafts") {
    return draft;
  }
  const fromMe = isFromMe(message);

  // sent are messages from us that *have* been sent
  if (folder == "sent") {
    return fromMe && !draft;
  }

  // remaining folders are all messages to me:
  const toMe = isToMe(message);
  if (!toMe) {
    return false;
  }
  if (folder == "inbox") {
    return !getBitField(message, "saved") && !deleted && !draft;
  }
  if (folder == "all") {
    return !deleted && !draft;
  }

  return false;
}

export function isRead(message: Mesg) {
  return getBitField(message, "read");
}

export function isStarred(message: Mesg) {
  return getBitField(message, "starred");
}

export function isLikedByMe(message: Mesg) {
  return getBitField(message, "liked");
}

export function isLiked(message: Mesg) {
  return likeCount({ message, inThread: true, threads: undefined }) > 0;
}

function countOnes(str: string): number {
  return str.split("").filter((char) => char === "1").length;
}

export function likeCount({ message, inThread, threads }): number {
  if (inThread) {
    // just this message
    const b = get(message, "liked");
    if (!b) {
      return 0;
    }
    return countOnes(b);
  } else {
    const thread = getThread({ message, threads });
    // sum of like counts over messages in the thread
    let m = 0;
    for (const mesg of thread) {
      m += likeCount({ message: mesg, inThread: true, threads });
    }
    return m;
  }
}

export function likedBy({ message, inThread, threads }): string[] {
  const from_id = get(message, "from_id");
  let to_ids = get(message, "to_ids") ?? [];
  if (iList.isList(to_ids)) {
    to_ids = to_ids.toJS();
  }
  const account_ids = new Set<string>();
  if (inThread) {
    // just this message
    const b = get(message, "liked") ?? "";
    if (b[0] == "1") {
      account_ids.add(from_id);
    }
    for (let i = 1; i < b.length; i++) {
      if (b[i] == "1") {
        account_ids.add(to_ids[i - 1]);
      }
    }
  } else {
    const thread = getThread({ message, threads });
    // max of like counts over messages in the thread
    for (const mesg of thread) {
      for (const account_id of likedBy({
        message: mesg,
        inThread: true,
        threads,
      })) {
        account_ids.add(account_id);
      }
    }
  }
  return Array.from(account_ids);
}

// true if every single message in the thread is read
export function isThreadRead({
  message,
  threads,
}: {
  message: Mesg;
  threads?: iThreads;
}) {
  const thread_id = get(message, "thread_id");
  if (threads == null || !thread_id) {
    return isRead(message);
  }
  for (const message1 of threads.get(thread_id) ?? []) {
    if (!isRead(message1)) {
      return false;
    }
  }
  return true;
}

export function isNullDate(date: Date | number | undefined | null): boolean {
  return date == null || new Date(date).valueOf() == 0;
}

export function isFromMe(message?: Mesg): boolean {
  return get(message, "from_id") == webapp_client.account_id;
}

// drafts are messages from us that haven't been sent yet.
export function isDraft(message?: Mesg): boolean {
  return isFromMe(message) && !get(message, "sent");
}

export function isToMe(message?: Mesg): boolean {
  return !!get(message, "to_ids")?.includes(webapp_client.account_id);
}

export function getThread({
  message,
  threads,
}: {
  message: Mesg;
  threads: iThreads | null;
}) {
  const thread_id = getThreadId(message);
  if (thread_id != null) {
    return threads?.get(thread_id) ?? [message];
  }
  return [message];
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
  messages: iMessagesMap;
}): Set<number> {
  if (threads == null || messages == null) {
    return ids;
  }
  const expanded = new Set<number>();
  for (const id of ids) {
    const thread_id = getThreadId(messages.get(id));
    if (thread_id != null) {
      for (const message of (threads.get(thread_id)?.toJS() as any) ?? [
        { id },
      ]) {
        expanded.add(message.id);
      }
    }
  }
  return expanded;
}

// Get newest "head" message in each thread in the given folder.
export function getFilteredMessages({
  folder,
  messages,
  threads,
  search,
}: {
  folder: Folder;
  messages: iMessagesMap;
  threads: iThreads;
  // matching search results -- only matters if folder=='search'
  search: Set<number>;
}): Message[] {
  let m = messages.filter((message) =>
    isInFolderThreaded({ message, threads, folder, search }),
  );

  // only keep the newest message in each thread -- this is what we display
  const missingThreadHeadIds = new Set<number>();
  m = m.filter((message) => {
    const thread_id = getThreadId(message);
    if (thread_id == null) {
      return true;
    }
    const thread = threads.get(thread_id);
    if (thread == null) {
      // message is not part of a nontrivial thread, so it is the head of its own trivial thread
      return true;
    }
    // message is part of a nontrivial thread.
    const headId = thread.get(thread.size - 1)?.get("id");
    if (headId != null && message.get("id") != headId) {
      missingThreadHeadIds.add(headId);
      return false;
    }
    return true;
  });

  if (missingThreadHeadIds.size > 0) {
    // add in messages where the newest message is not in m at all.
    // TODO: does this happen anymore, since we got rid of sentMessages.
    for (const id of missingThreadHeadIds) {
      if (m.get(id) == null) {
        const mesg = messages.get(id);
        if (mesg != null) {
          m = m.set(id, mesg);
        }
      }
    }
  }

  const filteredMessages = m
    .valueSeq()
    .toJS()
    .sort((a: any, b: any) => {
      if (a.sent && b.sent) {
        return cmp(b.sent, a.sent);
      }
      return cmp(b.id, a.id);
    }) as unknown as Message[];

  let index = 0;
  for (const message of filteredMessages) {
    message.index = index;
    index += 1;
  }
  return filteredMessages;
}

export function setFragment({ folder, id }: { folder: Folder; id?: number }) {
  Fragment.set({
    page: `messages-${folder}`,
    ...(id != null ? { id: `${id}` } : undefined),
  });
}

export function replySubject(subject) {
  if (!subject?.trim()) {
    return "Re:";
  }
  if (subject.toLowerCase().startsWith("re:")) {
    return subject;
  }
  return `Re: ${subject}`;
}

export function forwardSubject(subject) {
  if (!subject?.trim()) {
    return "Fwd:";
  }
  while (
    subject.toLowerCase().startsWith("re:") ||
    subject.toLowerCase().startsWith("fwd:")
  ) {
    subject = subject.slice(4).trim();
  }
  return `Fwd: ${subject}`;
}

export function getNotExpired(messages) {
  // filter out messages that are set to expire from our perspective.
  return messages.filter((message) => !isExpired(message));
}

export function getThreads(messages): iThreads {
  let threads: iThreads = iMap();

  const process = (message) => {
    // note that we use t = 0 or null for "root of a thread".
    const t = message.get("thread_id");
    const thread_id = t ? t : message.get("id");
    const thread = threads.get(thread_id);
    if (thread == null) {
      threads = threads.set(thread_id, iList([message]));
    } else {
      threads = threads.set(thread_id, thread.push(message));
    }
  };

  messages?.map(process);
  for (const thread_id of threads.keySeq()) {
    const thread = threads.get(thread_id);
    if (thread == null) {
      throw Error("bug");
    }
    threads = threads.set(
      thread_id,
      thread.sortBy((message) => message.get("id")),
    );
  }

  return threads;
}

// the id of the root message or undefined in case message is null.
export function getThreadId(message: Mesg | undefined): number | undefined {
  const thread_id = get(message, "thread_id");
  return thread_id ? thread_id : get(message, "id");
}

const FIELDS = new Set(Object.keys(SCHEMA.messages.fields));

export function get(message: Mesg | undefined, field: string) {
  if (message == null) {
    return;
  }
  if (!FIELDS.has(field)) {
    throw Error(`attempt to access invalid field ${field}`);
  }
  if (iMap.isMap(message)) {
    const m = message as unknown as iMessage;
    return m.get(field);
  } else {
    const m = message as unknown as Message;
    return m[field];
  }
}

function set<T extends Mesg | undefined>(message: T, field: string, value): T {
  if (message == null) {
    return message;
  }
  if (!FIELDS.has(field)) {
    throw Error(`attempt to access invalid field ${field}`);
  }
  if (iMap.isMap(message)) {
    const m = message as unknown as T;
    // @ts-ignore
    return m.set(field, value);
  } else {
    const m = message as unknown as T;
    // not a deep copy -- some danger.
    return { ...m, [field]: value };
  }
}

export function setBitField(
  message: Mesg,
  field: string,
  value: boolean,
  account_id?: string | number,
): Mesg {
  const bits = getBitSet({
    current: get(message, field),
    value,
    to_ids: get(message, "to_ids"),
    from_id: get(message, "from_id"),
    account_id,
  });
  return set(message, field, bits);
}

export function getBitField(
  message: Mesg,
  field: string,
  account_id?: string | number,
): boolean {
  if (message == null) {
    return false;
  }
  const from_id = get(message, "from_id");
  if (from_id == null) {
    return false;
  }
  const to_ids = get(message, "to_ids");
  if (to_ids == null) {
    return false;
  }
  const pos = getBitPosition({
    account_id,
    to_ids,
    from_id,
  });
  return (get(message, field) ?? "")[pos] == "1";
}

function getBitPosition({
  account_id = webapp_client.account_id!,
  to_ids,
  from_id,
}: {
  account_id?: string | number;
  to_ids;
  from_id: string;
}): number {
  if (typeof account_id == "number") {
    return account_id;
  } else {
    return getBitPosition0({ account_id, to_ids, from_id });
  }
}

function getBitSet({
  current = "",
  value,
  to_ids,
  from_id,
  account_id = webapp_client.account_id!,
}: {
  current?: string;
  value: boolean;
  to_ids;
  from_id: string;
  account_id?: string | number;
}): string {
  const pos = getBitPosition({ to_ids, from_id, account_id });
  if (pos == -1) {
    console.warn("getBitSet -- uknown id");
    return current;
  }
  // "current[pos] = value", where current is a string of 0's and 1's, hopefully.
  while (current.length <= pos) {
    current += "0";
  }
  const newValue =
    current.slice(0, pos) + (value ? "1" : "0") + current.slice(pos + 1);
  return newValue;
}

// Returns *all* accounts involved in a giving thread, without duplicates,
// as an array of account_id's.
export function participantsInThread({
  message,
  threads,
}: {
  message: Mesg;
  threads: iThreads;
}): string[] {
  // participants in a thread can change from one message to the next, so we
  // must walk the entire thread
  let ids;
  const thread_id = get(message, "thread_id") ?? get(message, "id");
  const thread = threads?.get(thread_id);
  if (thread != null) {
    ids = new Set<string>();
    // right now participants in a thread can shrink when you do not "reply all",
    // so we always show the root. people can't be added to an existing thread.
    for (const m of thread) {
      for (const account_id of get(m, "to_ids")) {
        ids.add(account_id);
      }
      const from_id = get(m, "from_id");
      ids.add(from_id);
    }
  } else {
    ids = new Set(get(message, "to_ids").concat([get(message, "from_id")]));
  }
  return Array.from(ids);
}

export function excludeSelf(account_ids: string[]): string[] {
  return account_ids.filter(
    (account_id) => account_id != webapp_client.account_id,
  );
}

export function excludeSelfUnlessAlone(account_ids: string[]): string[] {
  account_ids = account_ids.filter(
    (account_id) => account_id != webapp_client.account_id,
  );
  if (account_ids.length == 0) {
    account_ids = [webapp_client.account_id!]; // e.g., sending message to self.
  }
  return account_ids;
}

export function sendersInThread({
  message,
  threads,
}: {
  message: Mesg;
  threads: iThreads;
}): string[] {
  let ids;
  const thread_id = get(message, "thread_id") ?? get(message, "id");
  const thread = threads?.get(thread_id);
  if (thread != null) {
    ids = new Set<string>();
    for (const m of thread) {
      ids.add(get(m, "from_id"));
    }
    return Array.from(ids);
  } else {
    return [get(message, "from_id")];
  }
}

export function recipientsInThread({
  message,
  threads,
}: {
  message: Mesg;
  threads: iThreads;
}): string[] {
  let ids;
  const thread_id = get(message, "thread_id") ?? get(message, "id");
  const thread = threads?.get(thread_id);
  if (thread != null) {
    ids = new Set<string>();
    for (const m of thread) {
      for (const account_id of get(m, "to_ids")) {
        ids.add(account_id);
      }
    }
    return Array.from(ids);
  } else {
    return get(message, "to_ids");
  }
}
