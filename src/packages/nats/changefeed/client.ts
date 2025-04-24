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
  maxWait = 1000 * 60,
}: {
  account_id: string;
  query: any;
  options?: any[];
  maxWait?: number;
}) {
  if (!isValidUUID(account_id)) {
    throw Error("account_id must be a valid uuid");
  }
  const subject = changefeedSubject({ account_id });

  let lastSeq = -1;
  const { nc, jc } = await getEnv();
  await waitUntilConnected();
  for await (const mesg of await nc.requestMany(
    subject,
    jc.encode({ query, options }),
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
