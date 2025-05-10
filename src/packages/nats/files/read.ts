/*
Read a file from a project/compute server via an async generator, so it is memory
efficient.

This is a NATS service that uses requestMany, takes as input a filename path, and streams all
the binary data from that path.

We use headers to add sequence numbers into the response messages.

This is useful to implement:

- an http server for downloading any file, even large ones.


IDEAS:

- we could also implement a version of this that takes a directory
as input, runs compressed tar on it, and pipes the output into
response messages.  We could then implement streaming download of
a tarball of a directory tree, or also copying a directory tree from
one place to another (without using rsync).  I've done this already
over a websocket for compute servers, so would just copy that code.


DEVELOPMENT:

See src/packages/backend/nats/test/files/read.test.ts for unit tests.

~/cocalc/src/packages/backend$ node

require('@cocalc/backend/nats'); a = require('@cocalc/nats/files/read'); a.createServer({project_id:'00847397-d6a8-4cb0-96a8-6ef64ac3e6cf',compute_server_id:0,createReadStream:require('fs').createReadStream})

for await (const chunk of await a.readFile({project_id:'00847397-d6a8-4cb0-96a8-6ef64ac3e6cf',compute_server_id:0,path:'/tmp/a.py'})) { console.log({chunk}); }


for await (const chunk of await a.readFile({project_id:'00847397-d6a8-4cb0-96a8-6ef64ac3e6cf',compute_server_id:0,path:'/projects/6b851643-360e-435e-b87e-f9a6ab64a8b1/cocalc/.git/objects/pack/pack-771f7fe4ee855601463be070cf9fb9afc91f84ac.pack'})) { console.log({chunk}); }


*/

import { getEnv } from "@cocalc/nats/client";
import { projectSubject } from "@cocalc/nats/names";
import { Empty, headers, type Subscription } from "@nats-io/nats-core";
import { runLoop } from "./util";

let subs: { [name: string]: Subscription } = {};
export async function close({ project_id, compute_server_id, name = "" }) {
  const key = getSubject({ project_id, compute_server_id, name });
  if (subs[key] == null) {
    return;
  }
  const sub = subs[key];
  delete subs[key];
  await sub.drain();
}

function getSubject({ project_id, compute_server_id, name = "" }) {
  return projectSubject({
    project_id,
    compute_server_id,
    service: `files:read${name ?? ""}`,
  });
}

export async function createServer({
  createReadStream,
  project_id,
  compute_server_id,
  name = "",
}) {
  const subject = getSubject({
    project_id,
    compute_server_id,
    name,
  });
  if (subs[subject] != null) {
    return;
  }
  const { nc } = await getEnv();
  runLoop({
    listen,
    subs,
    subject,
    nc,
    opts: { createReadStream },
  });
}

async function listen({ sub, createReadStream }) {
  // NOTE: we just handle as many messages as we get in parallel, so this
  // could be a large number of simultaneous downloads. These are all by
  // authenticated users of the project, and the load is on the project,
  // so I think that makes sense.
  for await (const mesg of sub) {
    handleMessage(mesg, createReadStream);
  }
}

async function handleMessage(mesg, createReadStream) {
  try {
    await sendData(mesg, createReadStream);
    const h = headers();
    h.append("done", "");
    mesg.respond(Empty, { headers: h });
  } catch (err) {
    const h = headers();
    h.append("error", `${err}`);
    // console.log("sending ERROR", err);
    mesg.respond(Empty, { headers: h });
  }
}

const MAX_NATS_CHUNK_SIZE = 16384 * 16 * 3;

function getSeqHeader(seq) {
  const h = headers();
  h.append("seq", `${seq}`);
  return { headers: h };
}

async function sendData(mesg, createReadStream) {
  const { jc } = await getEnv();
  const { path } = jc.decode(mesg.data);
  let seq = 0;
  for await (let chunk of createReadStream(path, {
    highWaterMark: 16384 * 16 * 3,
  })) {
    // console.log("sending ", { seq, bytes: chunk.length });
    // We must break the chunk into smaller messages or it will
    // get bounced by nats... TODO: can we get the max
    // message size from nats?
    while (chunk.length > 0) {
      seq += 1;
      mesg.respond(chunk.slice(0, MAX_NATS_CHUNK_SIZE), getSeqHeader(seq));
      chunk = chunk.slice(MAX_NATS_CHUNK_SIZE);
    }
  }
}

export interface ReadFileOptions {
  project_id: string;
  compute_server_id?: number;
  path: string;
  name?: string;
  maxWait?: number;
}

export async function* readFile({
  project_id,
  compute_server_id = 0,
  path,
  name = "",
  maxWait = 1000 * 60 * 10, // 10 minutes
}: ReadFileOptions) {
  const { nc, jc } = await getEnv();
  const subject = getSubject({
    project_id,
    compute_server_id,
    name,
  });
  const v: any = [];
  let seq = 0;
  let bytes = 0;
  for await (const resp of await nc.requestMany(subject, jc.encode({ path }), {
    maxWait,
  })) {
    for (const [key, value] of resp.headers ?? []) {
      if (key == "error") {
        throw Error(value[0] ?? "bug");
      } else if (key == "done") {
        return;
      } else if (key == "seq") {
        const next = parseInt(value[0]);
        bytes = resp.data.length;
        // console.log("received seq", { seq: next, bytes });
        if (next != seq + 1) {
          throw Error(`lost data: seq=${seq}, next=${next}`);
        }
        seq = next;
      }
    }
    yield resp.data;
  }
  if (bytes != 0) {
    throw Error("truncated");
  }
  // console.log("done!");
  return v;
}
