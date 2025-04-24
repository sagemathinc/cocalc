/*
Changefeed client
*/

import { getEnv } from "@cocalc/nats/client";
import { isValidUUID } from "@cocalc/util/misc";
import { changefeedSubject } from "./server";
import { waitUntilConnected } from "@cocalc/nats/util";

export async function* changefeed({
  account_id,
  query,
  options,
  heartbeat,
  lifetime,
  maxWait,
}: {
  account_id: string;
  query: any;
  options?: any[];
  maxWait?: number;
  // server will send resp='' to ensure there is at least one message every this many ms.
  heartbeat?: number;
  // changefeed will live at most this long, then definitely die.
  lifetime?: number;
}) {
  if (!isValidUUID(account_id)) {
    throw Error("account_id must be a valid uuid");
  }
  const subject = changefeedSubject({ account_id });
  if (maxWait == null && heartbeat) {
    maxWait = heartbeat * 2.1;
  }

  let lastSeq = -1;
  const { nc, jc } = await getEnv();
  await waitUntilConnected();
  for await (const mesg of await nc.requestMany(
    subject,
    jc.encode({ query, options, heartbeat, lifetime }),
    { maxWait },
  )) {
    if (mesg.data.length == 0) {
      // done
      return;
    }
    const { error, resp, seq } = jc.decode(mesg.data);
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
