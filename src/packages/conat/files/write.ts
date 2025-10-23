/*
Streaming write over Conat to a project or compute server.

This is a key component to support user uploads, while being memory efficient
by streaming the write.  Basically it uses conat to support efficiently doing
streaming writes of files to any compute server or project that is somehow
connected to conat.

INSTRUCTIONS:

Import writeFile:

    import { writeFile } from "@cocalc/conat/files/write";

Now you can write a given path to a project (or compute_server) as
simply as this:

    const stream = createReadStream('a file')
    await writeFile({stream, project_id, compute_server_id, path, maxWait})

- Here stream can be any readable stream, not necessarily a stream made using
  a file.  E.g., you could use PassThrough and explicitly write to it by
  write calls.

- maxWait is a time in ms after which if the file isn't fully written, everything
  is cleaned up and there is an error.


HOW THIS WORKS:

Here's how this works from the side of the compute server:

- We start a request/response conat server on the compute server:
- There's one message it accepts, which is:
    "Using streaming download to get {path} from  [subject]."
  The sender of that message should set a long timeout (e.g., 10 minutes).
- It uses the streaming read functionality (in read.ts) to download and write
  to disk the file {path}.
- When done it responds {status:"success"} or {status:'error', error:'message...'}

Here's how it works from the side of whoever is sending the file:

- Start read server at [subject] that can send {path}.
- Send a request saying "we are making {path} available to you at [subject]."
- Get back "ok" or error. On error (or timeout), close the read server.
- Serve {path} exactly once using the server.  When finish sending {path},
  close it and clean up. We're done.



DEVELOPMENT:

See src/packages/backend/conat/test/files/write.test.ts for unit tests.

~/cocalc/src/packages/backend$ node

require('@cocalc/backend/conat'); a = require('@cocalc/conat/files/write');

project_id = '00847397-d6a8-4cb0-96a8-6ef64ac3e6cf'; compute_server_id = 0; await a.createServer({project_id,compute_server_id,createWriteStream:require('fs').createWriteStream});

stream=require('fs').createReadStream('env.ts');
await a.writeFile({stream, project_id, compute_server_id, path:'/tmp/a.ts'})

*/

import { conat } from "@cocalc/conat/client";
import { randomId } from "@cocalc/conat/names";
import {
  close as closeReadService,
  createServer as createReadServer,
  readFile,
} from "./read";
import { projectSubject } from "@cocalc/conat/names";
import {
  type Subscription,
  type Client as ConatClient,
} from "@cocalc/conat/core/client";
import { type Readable } from "node:stream";
import { getLogger } from "@cocalc/conat/client";
const logger = getLogger("conat:files:write");

function getWriteSubject({ project_id, compute_server_id }) {
  return projectSubject({
    project_id,
    compute_server_id,
    service: "files:write",
  });
}

let subs: { [name: string]: Subscription } = {};
export async function close({ project_id, compute_server_id }) {
  const subject = getWriteSubject({ project_id, compute_server_id });
  if (subs[subject] == null) {
    return;
  }
  const sub = subs[subject];
  delete subs[subject];
  await sub.drain();
}

export async function createServer({
  client = conat(),
  project_id,
  compute_server_id,
  createWriteStream,
}: {
  client?: ConatClient;
  project_id: string;
  compute_server_id: number;
  // createWriteStream returns a writeable stream
  // for writing the specified path to disk.  It
  // can be an async function.
  createWriteStream: (path: string) => any;
}) {
  const subject = getWriteSubject({ project_id, compute_server_id });
  logger.debug("createServer", { subject });
  let sub = subs[subject];
  if (sub != null) {
    return;
  }
  sub = await client.subscribe(subject);
  subs[subject] = sub;
  listen({ sub, createWriteStream, project_id, compute_server_id });
}

async function listen({
  sub,
  createWriteStream,
  project_id,
  compute_server_id,
}) {
  // NOTE: we just handle as many messages as we get in parallel, so this
  // could be a large number of simultaneous downloads. These are all by
  // authenticated users of the project, and the load is on the project,
  // so I think that makes sense.
  for await (const mesg of sub) {
    handleMessage({ mesg, createWriteStream, project_id, compute_server_id });
  }
}

async function handleMessage({
  mesg,
  createWriteStream,
  project_id,
  compute_server_id,
}) {
  let error = "";
  let writeStream: null | Awaited<ReturnType<typeof createWriteStream>> = null;
  try {
    const { path, name, maxWait } = mesg.data;
    logger.debug("handleMessage", { path, name, maxWait });
    writeStream = await createWriteStream(path);
    // console.log("created writeStream");
    writeStream.on("error", (err) => {
      error = `${err}`;
      mesg.respondSync({ error, status: "error" });
      console.warn(`error writing ${path}: ${error}`);
      writeStream.emit("remove");
    });
    let chunks = 0;
    let bytes = 0;
    for await (const chunk of await readFile({
      project_id,
      compute_server_id,
      name,
      path,
      maxWait,
    })) {
      if (error) {
        // console.log("error", error);
        writeStream.end();
        return;
      }
      writeStream.write(chunk);
      chunks += 1;
      bytes += chunk.length;
      logger.debug("handleMessage -- wrote", { path, name, bytes });
      // console.log("wrote ", bytes);
    }
    writeStream.end();
    writeStream.emit("rename");
    mesg.respondSync({ status: "success", bytes, chunks });
    logger.debug("handleMessage -- SUCCESS", { path, name });
  } catch (err) {
    logger.debug("handleMessage: ERROR", err);
    if (!error) {
      mesg.respondSync({ error: `${err}`, status: "error" });
      writeStream?.emit("remove");
    }
  }
}

export interface WriteFileOptions {
  project_id: string;
  compute_server_id?: number;
  path: string;
  stream: Readable;
  maxWait?: number;
}

export async function writeFile({
  client = conat(),
  project_id,
  compute_server_id = 0,
  path,
  stream,
  maxWait = 1000 * 60 * 10, // 10 minutes
}: {
  client?: ConatClient;
  project_id: string;
  compute_server_id?: number;
  path: string;
  stream;
  maxWait?: number;
}): Promise<{ bytes: number; chunks: number }> {
  logger.debug("writeFile", { project_id, compute_server_id, path, maxWait });
  const name = randomId();
  try {
    function createReadStream() {
      return stream;
    }
    // start read server
    await createReadServer({
      createReadStream,
      project_id,
      compute_server_id,
      name,
    });
    // tell compute server / project to start reading our file.
    const resp = await client.request(
      getWriteSubject({ project_id, compute_server_id }),
      { name, path, maxWait },
      { timeout: maxWait },
    );
    const { error, bytes, chunks } = resp.data;
    if (error) {
      throw Error(error);
    }
    return { bytes, chunks };
  } finally {
    await closeReadService({ project_id, compute_server_id, name });
  }
}
