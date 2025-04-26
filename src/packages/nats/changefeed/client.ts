/*
Changefeed client


changefeed(...) -- returns async iterator that outputs:

  - {id:string} -- defines id of the changefeed
  - '' -- heartbeats
  - standard changefeed messages exactly from the database

renew({id, lifetime}) -- keeps the changefeed alive for at least lifetime more ms.
*/

import { getEnv } from "@cocalc/nats/client";
import { isValidUUID } from "@cocalc/util/misc";
import { changefeedSubject, renewSubject, LAST_CHUNK } from "./server";
import { waitUntilConnected } from "@cocalc/nats/util";
export { DEFAULT_LIFETIME } from "./server";

export async function* changefeed({
  account_id,
  query,
  options,
  heartbeat,
  lifetime,
  maxActualLifetime = 1000 * 60 * 60 * 2,
}: {
  account_id: string;
  query: any;
  options?: any[];
  // maximum amount of time the changefeed can possibly stay alive, even with
  // many calls to extend it.
  maxActualLifetime?: number;
  // server will send resp='' to ensure there is at least one message every this many ms.
  heartbeat?: number;
  // changefeed will live at most this long, then definitely die.
  lifetime?: number;
}) {
  if (!isValidUUID(account_id)) {
    throw Error("account_id must be a valid uuid");
  }
  const subject = changefeedSubject({ account_id });

  let lastSeq = -1;
  const { nc, jc } = await getEnv();
  await waitUntilConnected();
  const chunks: Uint8Array[] = [];
  for await (const mesg of await nc.requestMany(
    subject,
    jc.encode({ query, options, heartbeat, lifetime }),
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
    yield resp;
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
  account_id,
  id,
  lifetime,
}: {
  account_id: string;
  id: string;
  lifetime?: number;
}) {
  const subject = renewSubject({ account_id });
  const { nc, jc } = await getEnv();
  await waitUntilConnected();
  const resp = await nc.request(subject, jc.encode({ id, lifetime }));
  return jc.decode(resp.data);
}
