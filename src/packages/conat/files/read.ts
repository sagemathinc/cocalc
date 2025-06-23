/*
Read a file from a project/compute server via an async generator, so it is memory
efficient.

This is a conat service that uses requestMany, takes as input a filename path, and streams all
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

See src/packages/backend/conat/test/files/read.test.ts for unit tests.

~/cocalc/src/packages/backend$ node

require('@cocalc/backend/conat'); a = require('@cocalc/conat/files/read'); a.createServer({project_id:'00847397-d6a8-4cb0-96a8-6ef64ac3e6cf',compute_server_id:0,createReadStream:require('fs').createReadStream})

for await (const chunk of await a.readFile({project_id:'00847397-d6a8-4cb0-96a8-6ef64ac3e6cf',compute_server_id:0,path:'/tmp/a'})) { console.log({chunk}); }


for await (const chunk of await a.readFile({project_id:'00847397-d6a8-4cb0-96a8-6ef64ac3e6cf',compute_server_id:0,path:'/projects/6b851643-360e-435e-b87e-f9a6ab64a8b1/cocalc/.git/objects/pack/pack-771f7fe4ee855601463be070cf9fb9afc91f84ac.pack'})) { console.log({chunk}); }


*/

import { conat } from "@cocalc/conat/client";
import { projectSubject } from "@cocalc/conat/names";
import { type Subscription } from "@cocalc/conat/core/client";

let subs: { [name: string]: Subscription } = {};
export async function close({ project_id, compute_server_id, name = "" }) {
  const subject = getSubject({ project_id, compute_server_id, name });
  if (subs[subject] == null) {
    return;
  }
  const sub = subs[subject];
  delete subs[subject];
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
  const cn = await conat();
  const sub = await cn.subscribe(subject);
  subs[subject] = sub;
  listen({ sub, createReadStream });
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
    await mesg.respond(null, { headers: { done: true } });
  } catch (err) {
    // console.log("sending ERROR", err);
    mesg.respondSync(null, { headers: { error: `${err}` } });
  }
}

const MAX_CHUNK_SIZE = 16384 * 16 * 3;

function getSeqHeader(seq) {
  return { headers: { seq } };
}

async function sendData(mesg, createReadStream) {
  const { path } = mesg.data;
  let seq = 0;
  for await (let chunk of createReadStream(path, {
    highWaterMark: 16384 * 16 * 3,
  })) {
    // console.log("sending ", { seq, bytes: chunk.length });
    // We must break the chunk into smaller messages or it will
    // get bounced by conat...
    while (chunk.length > 0) {
      seq += 1;
      mesg.respondSync(chunk.slice(0, MAX_CHUNK_SIZE), getSeqHeader(seq));
      chunk = chunk.slice(MAX_CHUNK_SIZE);
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
  const cn = await conat();
  const subject = getSubject({
    project_id,
    compute_server_id,
    name,
  });
  const v: any = [];
  let seq = 0;
  let bytes = 0;
  for await (const resp of await cn.requestMany(
    subject,
    { path },
    {
      maxWait,
    },
  )) {
    if (resp.headers == null) {
      continue;
    }
    if (resp.headers.error) {
      throw Error(`${resp.headers.error}`);
    }
    if (resp.headers.done) {
      return;
    }
    if (resp.headers.seq) {
      const next = resp.headers.seq as number;
      bytes = resp.data.length;
      // console.log("received seq", { seq: next, bytes });
      if (next != seq + 1) {
        throw Error(`lost data: seq=${seq}, next=${next}`);
      }
      seq = next;
    }
    yield resp.data;
  }
  if (bytes != 0) {
    throw Error("truncated");
  }
  // console.log("done!");
  return v;
}
