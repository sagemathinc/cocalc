/*
Streaming write over NATS to a project or compute server.

This is a key component to support user uploads, while being memory efficient
by streaming the write.

Here's how this works from the side of the compute server:

- We start a request/response NATS server on the compute server:
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

*/

import { getEnv } from "@cocalc/nats/client";
import { readFile } from "./read";
import { randomId } from "@cocalc/nats/names";
import {
  close as closeReadService,
  createServer as createReadServer,
} from "./read";
import { projectSubject } from "@cocalc/nats/names";
import { type Subscription } from "@nats-io/nats-core";
import { type Readable } from "node:stream";

function getWriteSubject({ project_id, compute_server_id }) {
  return projectSubject({
    project_id,
    compute_server_id,
    service: "files:write",
  });
}

let sub: Subscription | null = null;
export async function close() {
  if (sub == null) {
    return;
  }
  await sub.drain();
  sub = null;
}

export async function createServer({
  project_id,
  compute_server_id,
  createWriteStream,
}) {
  if (sub != null) {
    return;
  }
  const { nc } = await getEnv();
  const subject = getWriteSubject({ project_id, compute_server_id });
  sub = nc.subscribe(subject);
  listen({ createWriteStream, project_id, compute_server_id });
}

async function listen({ createWriteStream, project_id, compute_server_id }) {
  if (sub == null) {
    return;
  }
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
  try {
    const { jc } = await getEnv();
    const { path, name, maxWait } = jc.decode(mesg.data);
    const writeStream = createWriteStream(path);
    writeStream.on("error", (err) => {
      error = `${err}`;
      mesg.respond({ error, status: "error" });
      console.warn(`error writing ${path}: ${error}`);
    });
    for await (const chunk of await readFile({
      project_id,
      compute_server_id,
      name,
      path,
      maxWait,
    })) {
      if (error) {
        return;
      }
      writeStream.write(chunk);
    }
    writeStream.end();
    mesg.respond({ status: "success" });
  } catch (err) {
    if (!error) {
      mesg.respond({ error: `${err}`, status: "error" });
    }
  }
}

export async function writeFile({
  project_id,
  compute_server_id = 0,
  path,
  stream,
  maxWait = 1000 * 60 * 10, // 10 minutes
}: {
  project_id: string;
  compute_server_id?: number;
  path: string;
  stream: Readable;
  maxWait?: number;
}): Promise<void> {
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
    // tell compute server to start reading our file.
    const { nc, jc } = await getEnv();
    const resp = await nc.request(
      getWriteSubject({ project_id, compute_server_id }),
      jc.encode({ name, path, maxWait }),
      { timeout: maxWait },
    );
    const { error } = jc.decode(resp.data);
    if (error) {
      throw Error(error);
    }
  } finally {
    await closeReadService({ project_id, compute_server_id, name });
  }
}
