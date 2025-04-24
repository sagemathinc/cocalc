/*
Multiresponse request/response NATS changefeed server.
*/

import { getEnv } from "@cocalc/nats/client";
import { type Subscription, Empty } from "@nats-io/nats-core";
import { isValidUUID, uuid } from "@cocalc/util/misc";
import { getLogger } from "@cocalc/nats/client";
import { waitUntilConnected } from "@cocalc/nats/util";
import { delay } from "awaiting";

export const DEFAULT_LIFETIME = 15 * 1000 * 60;
export const MAX_LIFETIME = 60 * 1000 * 60;
export const MIN_HEARTBEAT = 5000;
export const MAX_HEARTBEAT = 120000;
export const MAX_CHANGEFEEDS_PER_ACCOUNT = parseInt(
  process.env.COCALC_MAX_CHANGEFEEDS_PER_ACCOUNT ?? "150",
);

const logger = getLogger("changefeed:server");

export const SUBJECT = process.env.COCALC_TEST_MODE
  ? "changefeeds-test"
  : "changefeeds";

export function changefeedSubject({ account_id }: { account_id: string }) {
  return `${SUBJECT}.account-${account_id}.api`;
}

function getUserId(subject: string): string {
  if (subject.startsWith(`${SUBJECT}.account-`)) {
    return subject.slice(
      `${SUBJECT}.account-`.length,
      `${SUBJECT}.account-`.length + 36,
    );
  }
  throw Error("invalid subject");
}

let terminated = false;
let sub: Subscription | null = null;
export async function init(db) {
  logger.debug("starting changefeed server");
  while (!terminated) {
    await waitUntilConnected();
    const { nc } = await getEnv();
    sub = nc.subscribe(`${SUBJECT}.*.api`, { queue: "q" });
    try {
      await listen(db);
    } catch (err) {
      logger.debug(`WARNING: main listen loop error -- ${err}`);
    }
    await delay(15000);
  }
}

export async function terminate() {
  terminated = true;
  if (sub == null) {
    return;
  }
  sub.drain();
  sub = null;
}

async function listen(db) {
  if (sub == null) {
    throw Error("must call init first");
  }
  for await (const mesg of sub) {
    if (terminated) {
      return;
    }
    handleMessage(mesg, db);
  }
}

let numChangefeeds = 0;
const numChangefeedsPerAccount: { [account_id: string]: number } = {};

async function handleMessage(mesg, db) {
  const { jc } = await getEnv();
  const request = jc.decode(mesg.data);
  const account_id = getUserId(mesg.subject);
  const changes = uuid();

  let seq = 0;
  let lastSend = 0;
  const respond = (error, resp?) => {
    if (terminated) {
      end();
    }
    lastSend = Date.now();
    if (resp?.action == "close") {
      end();
    } else {
      mesg.respond(jc.encode({ resp, error, seq }));
      seq += 1;
      if (error) {
        end();
      }
    }
  };

  numChangefeeds += 1;
  let done = false;
  const end = () => {
    if (done) {
      return;
    }
    done = true;
    numChangefeeds -= 1;
    db().user_query_cancel_changefeed({ id: changes });
    // end response stream with empty payload.
    mesg.respond(Empty);
  };

  if (numChangefeedsPerAccount[account_id] > MAX_CHANGEFEEDS_PER_ACCOUNT) {
    respond(
      `There is a limit of ${MAX_CHANGEFEEDS_PER_ACCOUNT} changefeeds per account`,
    );
    return;
  }

  let { heartbeat, lifetime = DEFAULT_LIFETIME } = request;
  delete request.lifetime;
  delete request.heartbeat;
  if (lifetime > MAX_LIFETIME) {
    lifetime = MAX_LIFETIME;
  }
  setTimeout(end, lifetime);

  async function heartbeatLoop() {
    let hb = parseFloat(heartbeat);
    if (hb < MIN_HEARTBEAT) {
      hb = MIN_HEARTBEAT;
    } else if (hb > MAX_HEARTBEAT) {
      hb = MAX_HEARTBEAT;
    }
    await delay(hb);
    while (!done) {
      const timeSinceLast = Date.now() - lastSend;
      if (timeSinceLast < hb) {
        // no neeed to send hearbeat yet
        await delay(hb - timeSinceLast);
        continue;
      }
      respond(undefined, "");
      await delay(hb);
    }
  }

  try {
    if (!isValidUUID(account_id)) {
      throw Error("account_id must be a valid uuid");
    }
    logger.debug("changefeeds", { numChangefeeds });
    db().user_query({
      ...request,
      account_id,
      changes,
      cb: respond,
    });

    if (heartbeat) {
      heartbeatLoop();
    }
  } catch (err) {
    if (!done) {
      respond(`${err}`);
    }
  }
}
