/*
Multiresponse request/response NATS changefeed server.

- Chunking to arbitrarily large data
- Lifetimes that can be extended
- Heartbeats
*/

import { getEnv } from "@cocalc/nats/client";
import { type Subscription } from "@cocalc/nats/server/client";
import { isValidUUID, uuid } from "@cocalc/util/misc";
import { getLogger } from "@cocalc/nats/client";
import { delay } from "awaiting";

export const DEFAULT_LIFETIME = 1000 * 60;
export const MAX_LIFETIME = 15 * 1000 * 60;
export const MIN_LIFETIME = 30 * 1000;
export const MIN_HEARTBEAT = 5000;
export const MAX_HEARTBEAT = 120000;
export const MAX_CHANGEFEEDS_PER_ACCOUNT = parseInt(
  process.env.MAX_CHANGEFEEDS_PER_ACCOUNT ?? "100",
);

export const MAX_CHANGEFEEDS_PER_SERVER = parseInt(
  process.env.MAX_CHANGEFEEDS_PER_SERVER ?? "5000",
);

const logger = getLogger("changefeed:server");

export const SUBJECT = process.env.COCALC_TEST_MODE
  ? "changefeeds-test"
  : "changefeeds";

export function changefeedSubject({ account_id }: { account_id: string }) {
  return `${SUBJECT}.account-${account_id}.api`;
}

export function renewSubject({ account_id }: { account_id: string }) {
  return `${SUBJECT}.account-${account_id}.renew`;
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
  logger.debug({
    DEFAULT_LIFETIME,
    MAX_LIFETIME,
    MIN_LIFETIME,
    MIN_HEARTBEAT,
    MAX_HEARTBEAT,
    MAX_CHANGEFEEDS_PER_ACCOUNT,
    MAX_CHANGEFEEDS_PER_SERVER,
    SUBJECT,
  });
  changefeedService(db);
  renewService();
}

async function changefeedService(db) {
  const { cn } = await getEnv();
  sub = await cn.subscribe(`${SUBJECT}.*.api`, { queue: "q" });
  try {
    await listen(db);
  } catch (err) {
    logger.debug(`WARNING: exiting changefeed service -- ${err}`);
  }
}

let renew: Subscription | null = null;
async function renewService() {
  const { cn } = await getEnv();
  renew = await cn.subscribe(`${SUBJECT}.*.renew`);
  try {
    await listenRenew();
  } catch (err) {
    logger.debug(`WARNING: exiting renewService error -- ${err}`);
  }
}

async function listenRenew() {
  if (renew == null) {
    throw Error("must call init first");
  }
  for await (const mesg of renew) {
    if (terminated) {
      return;
    }
    (async () => {
      try {
        await handleRenew(mesg);
      } catch (err) {
        logger.debug(`WARNING -- issue handling a renew message -- ${err}`);
      }
    })();
  }
}

const endOfLife: { [id: string]: number } = {};
function getLifetime({ lifetime }): number {
  if (lifetime === -1) {
    // special case of -1 used for cancel
    return lifetime;
  }
  if (!lifetime) {
    return DEFAULT_LIFETIME;
  }
  lifetime = parseFloat(lifetime);
  if (lifetime > MAX_LIFETIME) {
    return MAX_LIFETIME;
  }
  if (lifetime < MIN_LIFETIME) {
    return MIN_LIFETIME;
  }
  return lifetime;
}

async function handleRenew(mesg) {
  const request = mesg.data;
  if (!request) {
    return;
  }
  let { id } = request;
  if (endOfLife[id]) {
    // it's ours so we respond
    const lifetime = getLifetime(request);
    endOfLife[id] = Date.now() + lifetime;
    mesg.respond({ status: "ok" });
  }
}

export async function terminate() {
  terminated = true;
  if (sub != null) {
    sub.drain();
    sub = null;
  }
  if (renew != null) {
    renew.drain();
    renew = null;
  }
}

async function listen(db) {
  if (sub == null) {
    throw Error("must call init first");
  }
  for await (const mesg of sub) {
    if (terminated) {
      return;
    }

    (async () => {
      try {
        handleMessage(mesg, db);
      } catch (err) {
        logger.debug(`WARNING -- issue handling a changefeed -- ${err}`);
      }
    })();
  }
}

let numChangefeeds = 0;
const numChangefeedsPerAccount: { [account_id: string]: number } = {};

function metrics() {
  logger.debug("changefeeds", { numChangefeeds });
}

async function handleMessage(mesg, db) {
  const request = mesg.data;
  const account_id = getUserId(mesg.subject);
  const id = uuid();

  let seq = 0;
  let lastSend = 0;
  const respond = async (error, resp?) => {
    if (terminated) {
      end();
    }
    lastSend = Date.now();
    if (resp?.action == "close") {
      end();
    } else {
      mesg.respond({ resp, error, seq });
      seq += 1;
      if (error) {
        end();
      }
    }
  };

  numChangefeeds += 1;
  metrics();
  let done = false;
  const end = () => {
    if (done) {
      return;
    }
    done = true;
    delete endOfLife[id];
    numChangefeeds -= 1;
    metrics();
    db().user_query_cancel_changefeed({ id });
    // end response stream:
    mesg.respond(null);
  };

  if (numChangefeedsPerAccount[account_id] > MAX_CHANGEFEEDS_PER_ACCOUNT) {
    logger.debug(
      `numChangefeedsPerAccount[${account_id}] >= MAX_CHANGEFEEDS_PER_ACCOUNT`,
      {
        numChangefeedsPerAccountThis: numChangefeedsPerAccount[account_id],
        MAX_CHANGEFEEDS_PER_ACCOUNT,
      },
    );
    respond(
      `This server has a limit of ${MAX_CHANGEFEEDS_PER_ACCOUNT} changefeeds per account`,
    );
    return;
  }
  if (numChangefeeds >= MAX_CHANGEFEEDS_PER_SERVER) {
    logger.debug("numChangefeeds >= MAX_CHANGEFEEDS_PER_SERVER", {
      numChangefeeds,
      MAX_CHANGEFEEDS_PER_SERVER,
    });
    // this will just cause the client to make another attempt, hopefully
    // to another server
    respond(
      `This server has a limit of ${MAX_CHANGEFEEDS_PER_SERVER} changefeeds`,
    );
    return;
  }

  let { heartbeat } = request;
  const lifetime = getLifetime(request);
  delete request.lifetime;
  delete request.heartbeat;

  endOfLife[id] = Date.now() + lifetime;

  async function lifetimeLoop() {
    while (!done) {
      await delay(7500);
      if (!endOfLife[id] || endOfLife[id] <= Date.now()) {
        end();
        return;
      }
    }
  }
  lifetimeLoop();

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
        // no neeed to send heartbeat yet
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
    // send the id first
    respond(undefined, { id, lifetime });
    db().user_query({
      ...request,
      account_id,
      changes: id,
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
