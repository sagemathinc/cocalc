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

~/cocalc/src/packages/backend$ node

require('@cocalc/backend/nats'); a = require('@cocalc/nats/files/get'); a.createServer({project_id:'00847397-d6a8-4cb0-96a8-6ef64ac3e6cf',compute_server_id:0,createReadStream:require('fs').createReadStream})

for await (const chunk of await a.readFile({project_id:'00847397-d6a8-4cb0-96a8-6ef64ac3e6cf',compute_server_id:0,path:'/tmp/a.py'})) { console.log({chunk}); }


for await (const chunk of await a.readFile({project_id:'00847397-d6a8-4cb0-96a8-6ef64ac3e6cf',compute_server_id:0,path:'/projects/6b851643-360e-435e-b87e-f9a6ab64a8b1/cocalc/.git/objects/pack/pack-771f7fe4ee855601463be070cf9fb9afc91f84ac.pack'})) { console.log({chunk}); }


*/

import { getEnv } from "@cocalc/nats/client";
import { projectSubject } from "@cocalc/nats/names";
import { Empty, headers, type Subscription } from "@nats-io/nats-core";

let sub: Subscription | null = null;
export async function close() {
  if (sub == null) {
    return;
  }
  await sub.drain();
  sub = null;
}

function getSubject({ project_id, compute_server_id }) {
  return projectSubject({
    project_id,
    compute_server_id,
    service: "files:read",
  });
}

export async function createServer({
  createReadStream,
  project_id,
  compute_server_id,
}) {
  if (sub != null) {
    return;
  }
  const { nc } = await getEnv();
  const subject = getSubject({
    project_id,
    compute_server_id,
  });
  // console.log(subject);
  sub = nc.subscribe(subject);
  listen(createReadStream);
}

async function listen(createReadStream) {
  if (sub == null) {
    return;
  }
  for await (const mesg of sub) {
    try {
      await handleMessage(mesg, createReadStream);
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
}

async function handleMessage(mesg, createReadStream) {
  const { jc } = await getEnv();
  const { path } = jc.decode(mesg.data);
  let seq = 0;
  for await (const chunk of createReadStream(path, {
    highWaterMark: 16384 * 16 * 3,
  })) {
    const h = headers();
    seq += 1;
    h.append("seq", `${seq}`);
    // console.log("sending ", { seq, bytes: chunk.length });
    mesg.respond(chunk, { headers: h });
  }
}

export async function* readFile({
  project_id,
  compute_server_id,
  path,
  maxWait = 1000 * 60 * 10, // 10 minutes
}: {
  project_id: string;
  compute_server_id: number;
  path: string;
  maxWait?: number;
}) {
  const { nc, jc } = await getEnv();
  const subject = getSubject({
    project_id,
    compute_server_id,
  });
  const v: any = [];
  let seq = 0;
  let bytes = 0;
  for await (const resp of await nc.requestMany(subject, jc.encode({ path }), {
    maxWait,
  })) {
    for (const [key, value] of resp.headers) {
      if (key == "error") {
        throw Error(value);
      } else if (key == "done") {
        return;
      } else if (key == "seq") {
        const next = parseInt(value);
        bytes = resp.data.length;
        // console.log("received seq", { seq: next, bytes });
        if (next != seq + 1) {
          throw Error("lost data");
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
