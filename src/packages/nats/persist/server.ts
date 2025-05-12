/*

Maybe storage available as a service.

This is very similar to the changefeed server, because 
it provides a changefeed on a given persist storage, 
and a way to see values.

DEVELOPMENT:

Change to the packages/backend directory and run node.

This sets up the environment and starts the server running:

   require('@cocalc/backend/nats/persist').initServer()


In another node session, create a client:

    require('@cocalc/backend/nats'); c = require('@cocalc/nats/persist/client'); p = await c.changefeed({account_id:'00000000-0000-4000-8000-000000000000', path:'/tmp/a.db', cmd:'changefeed'}); for await(const x of p) { console.log(x) }


Back in the server process above:

   p = require('@cocalc/backend/nats/persist'); a = p.pstream({path:'/tmp/a.db'}); a.set({json:"foo"})
   
Or as another client:

   require('@cocalc/backend/nats'); c = require('@cocalc/nats/persist/client'); await c.command({account_id:'00000000-0000-4000-8000-000000000000', path:'/tmp/a.db', cmd:'set', options:{json:'xxx'}})
*/

import { pstream, type Message as StoredMessage } from "./storage";
import { getEnv } from "@cocalc/nats/client";
import { type Subscription, Empty, headers } from "@nats-io/nats-core";
import { isValidUUID, uuid } from "@cocalc/util/misc";
import { getLogger } from "@cocalc/nats/client";
import { waitUntilConnected } from "@cocalc/nats/util";
import { delay } from "awaiting";
import { getMaxPayload } from "@cocalc/nats/util";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

export const DEFAULT_LIFETIME = 1000 * 60;
export const MAX_LIFETIME = 15 * 1000 * 60;
export const MIN_LIFETIME = 30 * 1000;
export const MIN_HEARTBEAT = 5000;
export const MAX_HEARTBEAT = 120000;
export const MAX_PERSISTS_PER_USER = parseInt(
  process.env.MAX_PERSISTS_PER_USER ?? "100",
);

export const MAX_PERSISTS_PER_SERVER = parseInt(
  process.env.MAX_PERSISTS_PER_SERVER ?? "5000",
);

export const LAST_CHUNK = "last-chunk";

const logger = getLogger("persist:server");

export const SUBJECT = process.env.COCALC_TEST_MODE
  ? "persist-test"
  : "persist";

export type User =
  | { account_id: string; project_id: undefined }
  | { account_id: undefined; project_id: string };
export function persistSubject({ account_id, project_id }: User) {
  if (account_id) {
    return `${SUBJECT}.account-${account_id}.api`;
  } else if (project_id) {
    return `${SUBJECT}.project-${project_id}.api`;
  } else {
    throw Error("invalid user");
  }
}

export function renewSubject({ account_id, project_id }: User) {
  if (account_id) {
    return `${SUBJECT}.account-${account_id}.renew`;
  } else if (project_id) {
    return `${SUBJECT}.project-${project_id}.renew`;
  } else {
    throw Error("invalid user");
  }
}

function getUserId(subject: string): string {
  if (
    subject.startsWith(`${SUBJECT}.account-`) ||
    subject.startsWith(`${SUBJECT}.project-`)
  ) {
    // note that project and account have the same number of letters
    return subject.slice(
      `${SUBJECT}.account-`.length,
      `${SUBJECT}.account-`.length + 36,
    );
  }
  throw Error("invalid subject");
}

let terminated = false;
let sub: Subscription | null = null;
export async function init() {
  logger.debug("starting persist server");
  logger.debug({
    DEFAULT_LIFETIME,
    MAX_LIFETIME,
    MIN_LIFETIME,
    MIN_HEARTBEAT,
    MAX_HEARTBEAT,
    MAX_PERSISTS_PER_USER,
    MAX_PERSISTS_PER_SERVER,
    SUBJECT,
  });
  persistMainLoop();
  renewMainLoop();
}

async function persistMainLoop() {
  while (!terminated) {
    await waitUntilConnected();
    const { nc } = await getEnv();
    sub = nc.subscribe(`${SUBJECT}.*.api`, { queue: "q" });
    try {
      await listen();
    } catch (err) {
      logger.debug(`WARNING: persistMainLoop error -- ${err}`);
    }
    await delay(15000);
  }
}

let renew: Subscription | null = null;
async function renewMainLoop() {
  while (!terminated) {
    await waitUntilConnected();
    const { nc } = await getEnv();
    renew = nc.subscribe(`${SUBJECT}.*.renew`);
    try {
      await listenRenew();
    } catch (err) {
      logger.debug(`WARNING: renewMainLoop error -- ${err}`);
    }
    await delay(15000);
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
    handleRenew(mesg);
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
  const { jc } = await getEnv();
  const request = jc.decode(mesg.data);
  if (!request) {
    return;
  }
  let { id } = request;
  if (endOfLife[id]) {
    // it's ours so we respond
    const lifetime = getLifetime(request);
    endOfLife[id] = Date.now() + lifetime;
    mesg.respond(jc.encode({ status: "ok" }));
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

async function listen() {
  if (sub == null) {
    throw Error("must call init first");
  }
  for await (const mesg of sub) {
    if (terminated) {
      return;
    }
    handleMessage(mesg);
  }
}

let numPersists = 0;
const numPersistsPerUser: { [user_id: string]: number } = {};

function metrics() {
  logger.debug("persist", { numPersists });
}

async function send({ jc, mesg, resp }) {
  const maxPayload = (await getMaxPayload()) - 1000; // slack for header
  const data = jc.encode(resp);
  const chunks: Buffer[] = [];
  for (let i = 0; i < data.length; i += maxPayload) {
    const slice = data.slice(i, i + maxPayload);
    chunks.push(slice);
  }
  if (chunks.length > 1) {
    logger.debug(`sending message with ${chunks.length} chunks`);
  }
  for (let i = 0; i < chunks.length; i++) {
    if (i == chunks.length - 1) {
      const h = headers();
      h.append(LAST_CHUNK, "true");
      mesg.respond(chunks[i], { headers: h });
    } else {
      mesg.respond(chunks[i]);
    }
  }
}

async function handleMessage(mesg) {
  const { jc } = await getEnv();
  const request = jc.decode(mesg.data);
  //console.log("handleMessage", request);
  const user_id = getUserId(mesg.subject);
  const stream = pstream({ path: request.path });

  let seq = 0;
  let lastSend = 0;
  let end = () => {
    stream.close();
    mesg.respond(Empty);
  };
  const respond = async (error, resp?) => {
    if (terminated) {
      end();
    }
    lastSend = Date.now();
    if (resp?.action == "close") {
      end();
    } else {
      await send({ jc, mesg, resp: { resp, error, seq } });
      seq += 1;
      if (error) {
        end();
      }
    }
  };

  if (["set", "get", "delete"].includes(request.cmd)) {
    try {
      await respond(undefined, stream[request.cmd](request.options));
      end();
    } catch (err) {
      respond(`${err}`);
    }
    return;
  }

  if (request.cmd == "changefeed") {
    const id = uuid();
    numPersists += 1;
    metrics();
    let done = false;
    // more elaborate end.
    end = () => {
      if (done) {
        return;
      }
      done = true;
      delete endOfLife[id];
      numPersists -= 1;
      metrics();
      stream.close();
      // end response stream with empty payload.
      mesg.respond(Empty);
    };

    if (numPersistsPerUser[user_id] > MAX_PERSISTS_PER_USER) {
      logger.debug(`numPersistsPerUser[${user_id}] >= MAX_PERSISTS_PER_USER`, {
        numPersistsPerUserThis: numPersistsPerUser[user_id],
        MAX_PERSISTS_PER_USER,
      });
      respond(
        `This server has a limit of ${MAX_PERSISTS_PER_USER} persists per account`,
      );
      return;
    }
    if (numPersists >= MAX_PERSISTS_PER_SERVER) {
      logger.debug("numPersists >= MAX_PERSISTS_PER_SERVER", {
        numPersists,
        MAX_PERSISTS_PER_SERVER,
      });
      // this will just cause the client to make another attempt, hopefully
      // to another server
      respond(`This server has a limit of ${MAX_PERSISTS_PER_SERVER} persists`);
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
      if (!isValidUUID(user_id)) {
        throw Error("user_id must be a valid uuid");
      }
      // send the id first
      await respond(undefined, { id, lifetime });
      if (done) {
        return;
      }

      // send the current data
      for (const message of stream.getAll()) {
        if (done) {
          return;
        }
        await respond(undefined, message);
      }

      const unsentMessages: StoredMessage[] = [];
      const sendAllUnsentMessages = reuseInFlight(async () => {
        while (!done && unsentMessages.length > 0) {
          const message = unsentMessages.shift();
          if (done) {
            return;
          }
          await respond(undefined, message);
        }
      });

      stream.on("change", async (message) => {
        if (done) {
          return;
        }
        unsentMessages.push(message);
        sendAllUnsentMessages();
      });

      if (heartbeat) {
        heartbeatLoop();
      }
    } catch (err) {
      if (!done) {
        respond(`${err}`);
      }
    }
  } else {
    respond(`unknown command: '${request.cmd}'`);
  }
}
