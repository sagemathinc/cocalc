import type { Message } from "@cocalc/util/db-schema/messages";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { iThreads, iMessage, iMessagesMap, Folder } from "./types";
import { cmp } from "@cocalc/util/misc";
import Fragment from "@cocalc/frontend/misc/fragment-id";

//       WARNING: If you change or add fields and logic that could impact the "number of
// messages in the inbox that are not read", make sure to also update
//  packages/database/postgres/messages.ts

export function isInFolderThreaded({
  message,
  threads,
  folder,
  search,
}: {
  message: iMessage;
  threads: iThreads;
  folder: Folder;
  search?: Set<number>;
}) {
  const thread_id = message.get("thread_id");
  if (thread_id == null) {
    // not a thread
    return isInFolderNotThreaded({ message, folder, search });
  } else {
    // a message is in a folder if some message in the thread is in that folder.
    const thread = threads.get(thread_id);
    if (thread == null) {
      // data not fully loaded yet -- so use best fallback
      return isInFolderNotThreaded({ message, folder, search });
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
        if (!isNullDate(message.get("expire"))) {
          // gone (or will be very soon).
          return false;
        }
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
  search,
}: {
  message: iMessage;
  folder: Folder;
  search?: Set<number>;
}) {
  if (!isNullDate(message.get("expire"))) {
    // gone (or will be very soon).
    return false;
  }

  // trash folder is exactly the deleted messages:
  if (folder == "trash") {
    return message.get("deleted");
  }
  if (message.get("deleted")) {
    return false;
  }

  const isDraft = isNullDate(message.get("sent"));

  const fromMe =
    message.get("from_type") == "account" &&
    message.get("from_id") == webapp_client.account_id;

  if (folder == "search") {
    if ((isDraft && !fromMe) || search == null) {
      return false;
    }
    return search.has(message.get("id"));
  }

  // drafts are messages from us that haven't been sent yet.
  if (folder == "drafts") {
    return fromMe && isDraft;
  }

  // sent are messages from us that *have* been sent
  if (folder == "sent") {
    return fromMe && !isDraft;
  }

  // remaining folders are all messages to me:
  const toMe =
    message.get("to_type") == "account" &&
    message.get("to_id") == webapp_client.account_id;
  if (!toMe) {
    return false;
  }
  if (folder == "inbox") {
    return !message.get("saved") && !message.get("deleted") && !isDraft;
  }
  if (folder == "all") {
    return !message.get("deleted") && !isDraft;
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
export function isRead({
  message,
  folder,
}: {
  message: Message;
  folder: Folder;
}) {
  if (folder != "sent") {
    if (isFromMe(message)) {
      if (isToMe(message)) {
        return !isNullDate(message.read);
      }
      return true;
    }
    return !isNullDate(message.read);
  } else {
    if (isFromMe(message)) {
      return !isNullDate(message.read);
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
  message: Message;
  folder: Folder;
  threads?: iThreads;
}) {
  const thread_id = message.thread_id;
  if (threads == null || thread_id == null) {
    return isRead({ message, folder });
  }
  for (const message1 of threads.get(thread_id) ?? []) {
    if (!isRead({ message: message1.toJS(), folder })) {
      return false;
    }
  }
  return true;
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

export function isDraft(message?: Message): boolean {
  return isFromMe(message) && message?.sent == null;
}

export function isInTrash(message?: Message): boolean {
  return !!message?.deleted;
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
  messages: iMessagesMap;
}): Set<number> {
  if (threads == null || messages == null) {
    return ids;
  }
  const expanded = new Set<number>();
  for (const id of ids) {
    const thread_id = messages.get(id)?.get("thread_id") ?? id;
    for (const message of (threads.get(thread_id)?.toJS() as any) ?? [{ id }]) {
      expanded.add(message.id);
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
    const thread_id =
      message.get("thread_id") ??
      (threads.get(message.get("id")) != null ? message.get("id") : null);
    if (thread_id == null) {
      // message is not part of a thread
      return true;
    }
    // message is part of a thread.
    const thread = threads.get(thread_id);
    if (thread == null) {
      // this should never happen
      return true;
    }
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
