import { getEnv } from "@cocalc/nats/client";
import {
  persistSubject,
  renewSubject,
  type User,
  type Command,
} from "./server";
export { DEFAULT_LIFETIME } from "./server";
import { type Options as Storage, type Message } from "./storage";
import type { JSONValue } from "@cocalc/util/types";
export type { Storage };

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
  options,
}: {
  user: User;
  storage: Storage;
  start_seq?: number;
  options?: ConnectionOptions;
}): Promise<{ id: string; lifetime: number; stream }> {
  const stream = await callApiGetAll({
    user,
    storage,
    options,
    cmd: { name: "getAll", start_seq },
  });
  // the first element of the stream has the id, and the rest is the
  // stream user will consume
  const { value } = await stream.next();
  return { ...value, stream };
}

export async function set({
  user,
  storage,
  buffer,
  json,
  key,
}: {
  user: User;
  storage: Storage;
  buffer?: Buffer;
  json?: JSONValue;
  key?: string;
}): Promise<{ seq: number; time: number }> {
  //   console.log("set", {
  //     user,
  //     storage,
  //     buffer,
  //     json,
  //     key,
  //   });
  return await command({
    user,
    storage,
    cmd: { name: "set", buffer, json, key },
  });
}

export async function get({
  user,
  storage,
  seq,
  key,
}: {
  user;
  storage;
} & (
  | { seq: number; key: undefined }
  | { key: string; seq: undefined }
)): Promise<Message> {
  return await command({ user, storage, cmd: { name: "get", seq, key } });
}

async function* callApiGetAll({
  cmd,
  // who is accessing persistent storage
  user,
  // what storage they are accessing
  storage,
  // options for persistent connection
  options,
}: {
  user: User;
  storage: Storage;
  cmd: Command;
  options?: ConnectionOptions;
}) {
  const subject = persistSubject(user);
  const { cn } = await getEnv();

  const {
    heartbeat,
    lifetime,
    maxActualLifetime = cmd.name == "getAll" ? 1000 * 60 * 60 * 2 : undefined,
  } = options ?? {};

  const request = { cmd, heartbeat, lifetime, storage };
  let lastSeq = -1;
  for await (const resp of await cn.requestMany(subject, request, {
    maxWait: maxActualLifetime,
  })) {
    if (resp.data == null) {
      // terminate requestMany
      return;
    }
    const { error, content, seq } = resp.data;
    if (error) {
      throw Error(error);
    }
    if (lastSeq + 1 != seq) {
      throw Error("missed response");
    }
    lastSeq = seq;
    yield content;
  }
}

async function command({ user, storage, cmd }) {
  const subject = persistSubject(user);
  const { cn } = await getEnv();
  if (cmd.name == "getAll") {
    throw Error("cmd name must not be getAll");
  }
  const resp = await cn.request(subject, { cmd, storage });
  const x = resp.data;
  if (x.error) {
    throw Error(x.error);
  } else {
    return x.resp;
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
