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
import { delay } from "awaiting";
import { getLogger } from "@cocalc/conat/client";

const logger = getLogger("conat:files:read");

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
  logger.debug("createServer", { subject });
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
  logger.debug("handleMessage", mesg.subject);
  try {
    await sendData(mesg, createReadStream);
    await mesg.respond(null, { headers: { done: true } });
  } catch (err) {
    logger.debug("handleMessage: ERROR", err);
    mesg.respondSync(null, { headers: { error: `${err}` } });
  }
}

// 4MB -- chunks may be slightly bigger
const CHUNK_SIZE = 4194304;
const CHUNK_INTERVAL = 250;

function getSeqHeader(seq) {
  return { headers: { seq } };
}

async function sendData(mesg, createReadStream) {
  const { path } = mesg.data;
  logger.debug("sendData: starting", { path });
  let seq = 0;
  const chunks: Buffer[] = [];
  let size = 0;
  const sendChunks = async () => {
    // Not only is waiting for the response useful to make sure somebody is listening,
    // we also use await here partly to space out the messages to avoid saturing
    // the websocket connection, since doing so would break everything
    // (heartbeats, etc.) and disconnect us, when transfering a large file.
    seq += 1;
    logger.debug("sendData: sending", { path, seq });
    const data = Buffer.concat(chunks as any);
    const { count } = await mesg.respond(data, getSeqHeader(seq));
    if (count == 0) {
      logger.debug("sendData: nobody is listening");
      // nobody is listening so don't waste effort sending...
      throw Error("receiver is gone");
    }
    size = 0;
    chunks.length = 0;
    // Delay a little just to give other messages a chance, so we don't get disconnected
    // e.g., due to lack of heartbeats. Also, this reduces the load on conat-router.
    await delay(CHUNK_INTERVAL);
  };

  for await (let chunk of createReadStream(path, {
    highWaterMark: CHUNK_SIZE,
  })) {
    chunks.push(chunk);
    size += chunk.length;
    if (size >= CHUNK_SIZE) {
      // send it
      await sendChunks();
    }
  }
  if (size > 0) {
    await sendChunks();
  }
  logger.debug("sendData: done", { path }, "successfully sent ", seq, "chunks");
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
  logger.debug("readFile", { project_id, compute_server_id, path });
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
      // waitForInterest is extremely important because of the timing
      // of how readFile gets used by writeFile in write.ts.
      waitForInterest: true,
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
