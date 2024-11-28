import type { Message } from "@cocalc/util/db-schema/messages";
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
      folder == "search"
    ) {
      // inbox = at least one message in the thread is in inbox
      // sent = at least one message was sent by us
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
  const from = isFromMe(message);
  const to = isToMe(message);
  if (from && to) {
    return !!get(message, "to_expire") || !!get(message, "from_expire");
  }
  if (from) {
    return !!get(message, "from_expire");
  } else {
    return !!get(message, "to_expire");
  }
}

export function isDeleted(message: Mesg) {
  const from = isFromMe(message);
  const to = isToMe(message);
  if (from && to) {
    return !!get(message, "to_deleted") || !!get(message, "from_deleted");
  }
  if (from) {
    return !!get(message, "from_deleted");
  } else {
    return !!get(message, "to_deleted");
  }
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
    return !get(message, "saved") && !deleted && !draft;
  }
  if (folder == "all") {
    return !deleted && !draft;
  }

  return false;
}

// If the folder is anything but "sent", then the
// message is read if *we* have read it, where any
// message we have sent we have automatically read, and any
// message we receive is read if we mark it read.
// (except sending message to ourselves)
// If the folder is sent then things are switched: we
// care if the other person read it -- if they sent it,
// then of course they read it.  If we sent it, then they
// read it if it is marked read.
// Also note that we message.read can bew new Date(0) rather
// than null!
export function isRead({ message, folder }: { message: Mesg; folder: Folder }) {
  if (folder != "sent") {
    if (isFromMe(message)) {
      if (isToMe(message)) {
        return !isNullDate(get(message, "read"));
      }
      return true;
    }
    return !isNullDate(get(message, "read"));
  } else {
    if (isFromMe(message)) {
      return !isNullDate(get(message, "read"));
    }
    return true;
  }
}

// true if every single message in the thread is read
export function isThreadRead({
  message,
  threads,
  folder,
}: {
  message: Mesg;
  folder: Folder;
  threads?: iThreads;
}) {
  const thread_id = get(message, "thread_id");
  if (threads == null || !thread_id) {
    return isRead({ message, folder });
  }
  for (const message1 of threads.get(thread_id) ?? []) {
    if (!isRead({ message: message1, folder })) {
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
  return get(message, "to_ids").includes(webapp_client.account_id);
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
    return "";
  }
  if (subject.toLowerCase().startsWith("re:")) {
    return subject;
  }
  return `Re: ${subject}`;
}

export function getNotExpired(messages) {
  // filter out messages that are set to expire from our perspective.
  //  - if we are sender, then from_expire is set
  //  - if we are recipient, if to_expire is set.
  return messages.filter((message) => !isExpired(message));
}

export function getThreads(messages): iThreads {
  let threads: iThreads = iMap();

  const process = (message) => {
    const thread_id = message.get("thread_id");
    if (!thread_id) {
      return;
    }
    const root = messages.get(thread_id);
    if (root == null) {
      // messages is incomplete, e.g., maybe sent aren't loaded yet.
      return;
    }
    const thread = threads.get(thread_id);
    if (thread == null) {
      threads = threads.set(thread_id, iList([root, message]));
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
  if (field == "deleted") {
    field = isFromMe(message) ? "from_deleted" : "to_deleted";
  }
  if (field == "expire") {
    field = isFromMe(message) ? "from_expire" : "to_expire";
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
