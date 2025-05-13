import { getEnv } from "@cocalc/nats/client";
import {
  persistSubject,
  renewSubject,
  LAST_CHUNK,
  type User,
  type Command,
} from "./server";
import { waitUntilConnected } from "@cocalc/nats/util";
export { DEFAULT_LIFETIME } from "./server";
import { type Options as Storage, type Message } from "./storage";
import type { JSONValue } from "@cocalc/util/types";

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
  const stream = await callApi({
    user,
    storage,
    options,
    cmd: { name: "getAll", start_seq },
  });
  // the first element of the stream has the id, and the rest is the stream user will consume
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
  console.log("set", {
    user,
    storage,
    buffer,
    json,
    key,
  });
  if (buffer) {
    // [ ] TODO
    buffer = JSON.stringify(Buffer.from(buffer)) as any;
  }
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

async function* callApi({
  // who is accessing persistent storage
  user,
  // what storage they are accessing
  storage,
  // command they want to do
  cmd,
  // options for persistent connection
  options,
}: {
  user: User;
  storage: Storage;
  cmd: Command;
  options?: ConnectionOptions;
}) {
  const subject = persistSubject(user);
  let lastSeq = -1;
  const { nc, jc } = await getEnv();
  await waitUntilConnected();
  const chunks: Uint8Array[] = [];
  const {
    heartbeat,
    lifetime,
    maxActualLifetime = 1000 * 60 * 60 * 2,
  } = options ?? {};
  console.log({ storage, cmd, heartbeat, lifetime })
  for await (const mesg of await nc.requestMany(
    subject,
    jc.encode({ storage, cmd, heartbeat, lifetime }),
    { maxWait: maxActualLifetime },
  )) {
    if (mesg.data.length == 0) {
      // done
      return;
    }
    chunks.push(mesg.data);
    if (!isLastChunk(mesg)) {
      continue;
    }
    const data = Buffer.concat(chunks);
    chunks.length = 0;
    const { error, resp, seq } = jc.decode(data);
    if (error) {
      throw Error(error);
    }
    if (lastSeq + 1 != seq) {
      throw Error("missed response");
    }
    lastSeq = seq;
    // [ ] TODO: we are making buffers work for now in a REALLY STUPID
    // way, which is just text JSON instead of binary payload.
    // This is temporary to make sure this approach works!
    if (resp.buffer != null) {
      resp.buffer = Buffer.from(resp.buffer);
    }
    yield resp;
  }
}

async function command(opts) {
  for await (const x of await callApi(opts)) {
    return x;
  }
}

function isLastChunk(mesg) {
  for (const [key, _] of mesg.headers ?? []) {
    if (key == LAST_CHUNK) {
      return true;
    }
  }
  return false;
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
  const { nc, jc } = await getEnv();
  await waitUntilConnected();
  const resp = await nc.request(subject, jc.encode({ id, lifetime }));
  return jc.decode(resp.data);
}
