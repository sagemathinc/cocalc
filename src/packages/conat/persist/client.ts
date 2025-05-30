import { conat } from "@cocalc/conat/client";
import {
  persistSubject,
  renewSubject,
  type User,
  DEFAULT_HEARTBEAT,
  HEARTBEAT_STRING,
  assertHasWritePermission as assertHasWritePermission0,
} from "./server";
export { DEFAULT_LIFETIME } from "./server";
import type {
  Options as Storage,
  SetOperation,
  DeleteOperation,
  Configuration,
} from "./storage";
export type { Storage, SetOperation, DeleteOperation, Configuration };
import {
  Message as ConatMessage,
  MessageData,
  ConatError,
} from "@cocalc/conat/core/client";
import { withTimeout } from "@cocalc/util/async-utils";

export interface ConnectionOptions {
  // server will send resp='' to ensure there is at least one message
  // every this many ms.
  heartbeat?: number;
  // persist will live at most this long, then definitely die unless renewed
  // by a renew message from the client.
  lifetime?: number;
}

let permissionChecks = true;
export function disablePermissionCheck() {
  if (!process.env.COCALC_TEST_MODE) {
    throw Error("disabling permission check only allowed in test mode");
  }
  permissionChecks = false;
}
const assertHasWritePermission = (opts) => {
  if (!permissionChecks) {
    // should only be used for unit testing, since otherwise would
    // make clients slower and possibly increase server load.
    return;
  }
  return assertHasWritePermission0(opts);
};

export function checkMessageHeaderForError(mesg) {
  if (mesg.headers === undefined) {
    return;
  }
  const { error, code } = mesg.headers;
  if (error || code) {
    throw new ConatError(error ?? "error", { code });
  }
}

export async function getAll({
  user,
  storage,
  start_seq,
  end_seq,
  options,
}: {
  user: User;
  storage: Storage;
  start_seq?: number;
  end_seq?: number;
  options?: ConnectionOptions;
}): Promise<{ id?: string; lifetime?: number; stream }> {
  const stream = await callApiGetAll({
    user,
    storage,
    options,
    start_seq,
    end_seq,
  });
  if (end_seq) {
    return { stream };
  }
  // the first element of the stream has the id, and the rest is the
  // stream user will consume
  const { value, done } = await stream.next();
  if (done) {
    throw Error("got no response");
  }
  checkMessageHeaderForError(value);

  const x = value?.headers?.content as any;
  if (typeof x?.id != "string" || typeof x?.lifetime != "number") {
    throw Error("invalid data from server");
  }
  return { ...x, stream };
}

export async function set({
  user,
  storage,
  key,
  ttl,
  previousSeq,
  msgID,
  messageData,
  timeout,
}: {
  user: User;
  storage: Storage;
  key?: string;
  ttl?: number;
  previousSeq?: number;
  msgID?: string;
  messageData: MessageData;
  timeout?: number;
}): Promise<{ seq: number; time: number }> {
  const subject = persistSubject(user);
  assertHasWritePermission({ subject, path: storage.path });
  const cn = await conat();

  const reply = await cn.request(subject, null, {
    raw: messageData.raw,
    encoding: messageData.encoding,
    headers: {
      headers: messageData.headers,
      cmd: "set",
      key,
      ttl,
      previousSeq,
      msgID,
      storage,
    } as any,
    timeout,
  });
  checkMessageHeaderForError(reply);
  return reply.data;
}

export async function deleteMessages({
  user,
  storage,
  timeout,
  seq,
  last_seq,
  all,
}: {
  user: User;
  storage: Storage;
  timeout?: number;
  seq?: number;
  last_seq?: number;
  all?: boolean;
}): Promise<{ seqs: number[] }> {
  const subject = persistSubject(user);
  assertHasWritePermission({ subject, path: storage.path });
  const cn = await conat();

  const reply = await cn.request(subject, null, {
    headers: {
      storage: storage as any,
      cmd: "delete",
      seq,
      last_seq,
      all,
    } as any,
    timeout,
  });
  checkMessageHeaderForError(reply);
  return reply.data;
}

export async function config({
  user,
  storage,
  config,
  timeout,
}: {
  user: User;
  storage: Storage;
  config?: Partial<Configuration>;
  timeout?: number;
}): Promise<Configuration> {
  const subject = persistSubject(user);
  assertHasWritePermission({ subject, path: storage.path });
  const cn = await conat();

  const reply = await cn.request(subject, null, {
    headers: {
      storage: storage as any,
      cmd: "config",
      config,
    } as any,
    timeout,
  });
  checkMessageHeaderForError(reply);
  return reply.data;
}

export async function get({
  user,
  storage,
  seq,
  key,
  timeout,
}: {
  user;
  storage;
  timeout?: number;
} & (
  | { seq: number; key?: undefined }
  | { key: string; seq?: undefined }
)): Promise<ConatMessage | undefined> {
  const subject = persistSubject(user);
  assertHasWritePermission({ subject, path: storage.path });
  const cn = await conat();

  const resp = await cn.request(subject, null, {
    headers: { cmd: "get", storage, seq, key } as any,
    timeout,
  });
  checkMessageHeaderForError(resp);
  if (resp.headers == null) {
    return undefined;
  }
  return resp;
}

export async function keys({
  user,
  storage,
  timeout,
}: {
  user;
  storage;
  timeout?: number;
}): Promise<string[]> {
  const subject = persistSubject(user);
  assertHasWritePermission({ subject, path: storage.path });
  const cn = await conat();

  const reply = await cn.request(subject, null, {
    headers: { cmd: "keys", storage } as any,
    timeout,
  });
  checkMessageHeaderForError(reply);
  return reply.data;
}

export async function sqlite({
  user,
  storage,
  timeout,
  statement,
  params,
}: {
  user;
  storage;
  timeout?: number;
  statement: string;
  params?: any[];
}): Promise<any[]> {
  const subject = persistSubject(user);
  assertHasWritePermission({ subject, path: storage.path });
  const cn = await conat();

  const reply = await cn.request(subject, null, {
    headers: { cmd: "sqlite", storage, statement, params } as any,
    timeout,
  });
  checkMessageHeaderForError(reply);
  return reply.data;
}

// if the user doesn't have permission to access this storage, this
// should throw an error with code 403; that should be handled by
// requestMany attempting to publish to a subject that user can't access.
async function* callApiGetAll({
  start_seq,
  end_seq,
  // who is accessing persistent storage
  user,
  // what storage they are accessing
  storage,
  // options for persistent connection
  options,
}: {
  start_seq?: number;
  end_seq?: number;
  user: User;
  storage: Storage;
  options?: ConnectionOptions;
}) {
  const subject = persistSubject(user);
  assertHasWritePermission({ subject, path: storage.path });
  const cn = await conat();

  const { heartbeat = DEFAULT_HEARTBEAT, lifetime } = options ?? {};

  let lastSeq = -1;

  // We create an iterator over messages in the stream.
  // It watches for heartbeats (or data) from the stream
  // and if at least one doesn't arrive every heartbeat
  // ms, it will exit, thus ending the async iterator.
  // Also, the server may send an explicit end message in
  // case the client didn't send a renew message to extend
  // the lifetime further.
  // I.e., the one and only reason this async iterator should
  // end is that one end stopped sending regular info.  When
  // that happens if the client still has interest, they should
  // make a new iterator starting where they left off.  If
  // there are no clients left listening, the server will close
  // the stream.

  const iter = await cn.requestMany(subject, null, {
    headers: {
      cmd: "getAll",
      start_seq,
      end_seq,
      heartbeat,
      lifetime,
      storage,
    } as any,
  });

  while (true) {
    let resp;
    try {
      const { value, done } = await withTimeout(iter.next(), heartbeat + 3000);
      if (done) {
        return;
      } else {
        resp = value;
      }
    } catch {
      // timeout
      return;
    }
    if (resp.headers == null) {
      // terminate requestMany explicitly by sending message with no headers
      return;
    }
    if (resp.headers.content == HEARTBEAT_STRING) {
      // it is just a heartbeat
      continue;
    }
    checkMessageHeaderForError(resp);
    const { seq } = resp.headers;
    if (typeof seq != "number") {
      // this should never happen.
      throw Error("seq must be a number");
    }
    if (lastSeq + 1 != seq) {
      // missed response -- we just end the iterator and
      // the client can make a new one if they need to.
      return;
    }
    lastSeq = seq;
    yield resp;
  }
}

export async function renew({
  user,
  id,
  lifetime,
}: {
  user: User;
  id: string;
  lifetime?: number;
} & User) {
  const subject = renewSubject(user);
  const cn = await conat();
  const resp = await cn.request(subject, { id, lifetime });
  return resp.data;
}
