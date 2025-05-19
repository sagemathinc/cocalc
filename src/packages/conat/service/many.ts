/*
Support requestMany and respond to requestMany request transparently.

If the request is sent via the function requestMany below, then:
  (1) it contains the HEADER ("requestMany") with value "Empty",
  (2) it combines all the responses together (until receiving Empty) and returns that

On the other side, respondMany looks for HEADER and if it is set,
breaks up the response data into maximum size chunks based on the
server configured max payload size.

By using this pair of functions the client can control whether or not
request many is used for a particular request.  In particular, if the
header isn't set to request many, then no extra messages get sent back.
*/

import { Empty, headers } from "@nats-io/nats-core";
import { getMaxPayload } from "@cocalc/conat/util";

export async function respondMany({ mesg, data }) {
  if (!hasRequestManyHeader(mesg)) {
    // console.log("respondMany: using NORMAL response");
    // header not set, so just send a normal response.
    await mesg.respond(data);
    return;
  }
  // console.log("respondMany: using CHUNKED response");
  // header set, so send response as multiple messages broken into
  // chunks followed by an Empty message to terminate.
  const maxPayload = await getMaxPayload();
  for (let i = 0; i < data.length; i += maxPayload) {
    const slice = data.slice(i, i + maxPayload);
    await mesg.respond(slice);
  }
  await mesg.respond(Empty);
}

export async function requestMany({
  nc,
  subject,
  data,
  maxWait,
}: {
  nc;
  subject: string;
  data;
  maxWait?: number;
}): Promise<{ data: Buffer }> {
  // set a special header so that server knows to use our respond many protocol.
  const h = headers();
  h.append(HEADER, TERMINATE);
  const v: any[] = [];
  for await (const resp of await nc.requestMany(subject, data, {
    maxWait,
    headers: h,
  })) {
    if (resp.data.length == 0) {
      break;
    }
    v.push(resp);
  }
  const respData = Buffer.concat(v.map((x) => x.data));
  return { data: respData };
}

export const HEADER = "requestMany";
// terminate on empty message -- only protocol we support right now
export const TERMINATE = "Empty";

function hasRequestManyHeader(mesg) {
  for (const [key, value] of mesg.headers ?? []) {
    if (key == HEADER && value == TERMINATE) {
      return true;
    }
  }
  return false;
}
