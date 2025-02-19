/*
A NATS service that uses requestMany, takes as input a filename apth, and streams all
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
*/

import { getEnv } from "@cocalc/nats/client";
import { projectSubject } from "@cocalc/nats/names";

function getSubject({ project_id, compute_server_id }) {
  return projectSubject({
    project_id,
    compute_server_id,
    service: "files-get",
  });
}

export async function createServer({
  readFromDisk,
  project_id,
  compute_server_id,
}) {
  const { nc, jc } = await getEnv();
  const subject = getSubject({
    project_id,
    compute_server_id,
  });
  console.log(subject);
  const sub = nc.subscribe(subject);
  for await (const mesg of sub) {
    handleMessage(mesg);
  }
}

async function handleMessage(mesg) {
  mesg.respond("xxx");
  mesg.respond("yyy");
  mesg.respond();
}

export async function getFile({ project_id, compute_server_id, path }) {
  const { nc, jc } = await getEnv();
  const subject = getSubject({
    project_id,
    compute_server_id,
  });
  const v: any = [];
  for await (const resp of await nc.requestMany(subject, jc.encode({ path }))) {
    console.log(resp);
    v.push(resp);
  }
  console.log("done");
  return v;
}
