import { getEnv } from "@cocalc/conat/client";
import { persistSubject, renewSubject, type User } from "./server";
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

interface ConnectionOptions {
  // maximum amount of time the persist can possibly stay alive, even with
  // many calls to extend it.
  maxActualLifetime?: number;
  // server will send resp='' to ensure there is at least one message every this many ms.
  heartbeat?: number;
  // persist will live at most this long, then definitely die unless renewed.
  lifetime?: number;
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
  const { cn } = await getEnv();

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
  const { error, code, resp } = reply.data;
  if (error) {
    throw new ConatError(error, { code });
  }
  return resp;
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
  const { cn } = await getEnv();

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
  const { error, resp } = reply.data;
  if (error) {
    throw Error(error);
  }
  return resp;
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
  const { cn } = await getEnv();

  const reply = await cn.request(subject, null, {
    headers: {
      storage: storage as any,
      cmd: "config",
      config,
    } as any,
    timeout,
  });
  const { error, resp } = reply.data;
  if (error) {
    throw Error(error);
  }
  return resp;
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
  const { cn } = await getEnv();

  const resp = await cn.request(subject, null, {
    headers: { cmd: "get", storage, seq, key } as any,
    timeout,
  });
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
  const { cn } = await getEnv();

  const reply = await cn.request(subject, null, {
    headers: { cmd: "keys", storage } as any,
    timeout,
  });
  const { error, resp } = reply.data;
  if (error) {
    throw Error(error);
  }
  return resp;
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
  const { cn } = await getEnv();

  const reply = await cn.request(subject, null, {
    headers: { cmd: "sqlite", storage, statement, params } as any,
    timeout,
  });
  const { error, resp } = reply.data;
  if (error) {
    throw Error(error);
  }
  return resp;
}

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
  const { cn } = await getEnv();

  const {
    heartbeat,
    lifetime,
    maxActualLifetime = 1000 * 60 * 60 * 2,
  } = options ?? {};

  let lastSeq = -1;
  for await (const resp of await cn.requestMany(subject, null, {
    maxWait: maxActualLifetime,
    headers: {
      cmd: "getAll",
      start_seq,
      end_seq,
      heartbeat,
      lifetime,
      storage,
    } as any,
  })) {
    if (resp.headers == null) {
      // terminate requestMany
      return;
    }

    const { error, seq } = resp.headers;
    if (error) {
      throw Error(`${error}`);
    }
    if (typeof seq != "number") {
      throw Error("seq must be a number");
    }
    if (lastSeq + 1 != seq) {
      throw Error("missed response");
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
  const { cn } = await getEnv();
  const resp = await cn.request(subject, { id, lifetime });
  return resp.data;
}
