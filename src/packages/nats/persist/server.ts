/*

Maybe storage available as a service.

This code is similar to the changefeed server, because 
it provides a changefeed on a given persist storage, 
and a way to see values.

DEVELOPMENT:

Change to the packages/backend directory and run node.

TERMINAL 1: This sets up the environment and starts the server running:

   require('@cocalc/backend/nats/persist').initServer()


TERMINAL 2: In another node session, create a client:

    user = {account_id:'00000000-0000-4000-8000-000000000000'}; storage = {path:'a.db'}; const {id, lifetime, stream} = await require('@cocalc/backend/nats/persist').getAll({user, storage, options:{lifetime:1000*60}}); console.log({id}); for await(const x of stream) { console.log(x) }; console.log("DONE")

// client also does this periodically to keep subscription alive:

    await renew({user, id }) 

TERMINAL 3:

user = {account_id:'00000000-0000-4000-8000-000000000000'}; storage = {path:'a.db'}; const {set,get} = require('@cocalc/backend/nats/persist');0;

   await set({user, storage, json:Math.random()})
   
   await get({user, storage,  seq:1})
   
   await set({user, storage, json:Math.random(), key:'bella'})
   
   await get({user, storage,  key:'bella'})
   
Also getAll using start_seq:

   cf = const {id, lifetime, stream} = await require('@cocalc/backend/nats/persist').getAll({user, storage, start_seq:10, options:{lifetime:1000*60}}); for await(const x of stream) { console.log(x) };
*/

import { pstream, type Message as StoredMessage } from "./storage";
import { getEnv } from "@cocalc/nats/client";
import { type Subscription } from "@cocalc/nats/server/client";
import { uuid } from "@cocalc/util/misc";
import { getLogger } from "@cocalc/nats/client";
import { delay } from "awaiting";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import type { JSONValue } from "@cocalc/util/types";
import { join } from "path";
import { syncFiles, ensureContainingDirectoryExists } from "./context";

export const DEFAULT_LIFETIME = 5 * 1000 * 60;
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

export interface SetCommand {
  name: "set";
  buffer?: Buffer;
  json?: JSONValue;
  key?: string;
}

export interface GetByKeyCommand {
  name: "get";
  key: string;
}

export interface GetBySeqCommand {
  name: "get";
  seq: number;
}

export interface GetAllCommand {
  name: "getAll";
  start_seq?: number;
}

export type Command =
  | SetCommand
  | GetByKeyCommand
  | GetBySeqCommand
  | GetAllCommand;

export type User = { account_id?: string; project_id?: string };
export function persistSubject({ account_id, project_id }: User) {
  if (account_id) {
    return `${SUBJECT}.account-${account_id}.api`;
  } else if (project_id) {
    return `${SUBJECT}.project-${project_id}.api`;
  } else {
    return `${SUBJECT}.hub.api`;
  }
}

export function renewSubject({ account_id, project_id }: User) {
  if (account_id) {
    return `${SUBJECT}.account-${account_id}.renew`;
  } else if (project_id) {
    return `${SUBJECT}.project-${project_id}.renew`;
  } else {
    return `${SUBJECT}.hub.renew`;
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
  return "";
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
  persistService();
  renewService();
}

async function noThrow(f) {
  try {
    await f();
  } catch (err) {
    logger.debug(`WARNING -- ${err}`);
  }
}

async function persistService() {
  const { cn } = await getEnv();
  sub = await cn.subscribe(`${SUBJECT}.*.api`, { queue: "q" });
  await listenPersist();
}

let renew: Subscription | null = null;
async function renewService() {
  const { cn } = await getEnv();
  renew = await cn.subscribe(`${SUBJECT}.*.renew`);
  await listenRenew();
}

async function listenRenew() {
  if (renew == null) {
    throw Error("must call init first");
  }
  for await (const mesg of renew) {
    if (terminated) {
      return;
    }
    noThrow(async () => await handleRenew(mesg));
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

async function listenPersist() {
  if (sub == null) {
    throw Error("must call init first");
  }
  for await (const mesg of sub) {
    if (terminated) {
      return;
    }
    noThrow(async () => await handleMessage(mesg));
  }
}

let numPersists = 0;
const numPersistsPerUser: { [user_id: string]: number } = {};

function metrics() {
  logger.debug("persist", { numPersists });
}

async function handleMessage(mesg) {
  const request = mesg.data;
  console.log("handleMessage", request);
  const user_id = getUserId(mesg.subject);

  // [ ] TODO: permissions and sanity checks!
  const path = join(syncFiles.local, request.storage.path);
  await ensureContainingDirectoryExists(path);
  const stream = pstream({ ...request.storage, path });
  const { name, ...arg } = request.cmd;

  // get and set using normal request/respond
  if (["set", "get"].includes(name)) {
    console.log("command", { path, name, arg });
    try {
      const resp = stream[name](arg);
      console.log("resp = ", resp);
      mesg.respond({ resp });
    } catch (err) {
      mesg.respond({ error: `${err}` });
    }
    return;
  }

  if (name != "getAll") {
    mesg.respond({ error: `unknown command ${name}` });
    return;
  }

  await getAll({ mesg, request, user_id, stream });
}

async function getAll({ mesg, request, user_id, stream }) {
  // getAll sends multiple responses
  let seq = 0;
  let lastSend = 0;
  let end = () => {
    stream.close();
    mesg.respond(null);
  };
  const respond = async (error, content?) => {
    if (terminated) {
      end();
    }
    lastSend = Date.now();
    mesg.respond({ content, error, seq });
    seq += 1;
    if (error) {
      end();
    }
  };

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
    mesg.respond(null);
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
    // send the id first
    await respond(undefined, { id, lifetime });
    if (done) {
      return;
    }

    // send the current data
    // [ ] TODO: should we just send it all as a single message?
    //     much faster, but uses much more RAM.  Maybe some
    //     combination based on actual data!
    for (const message of stream.getAll(request.arg)) {
      if (done) {
        return;
      }
      await respond(undefined, message);
    }

    // send state change message
    await respond(undefined, { state: "watch" });

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
      //console.log("stream change event", message);
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
}
