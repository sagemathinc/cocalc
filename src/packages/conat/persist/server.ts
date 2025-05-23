/*

Maybe storage available as a service.

This code is similar to the changefeed server, because 
it provides a changefeed on a given persist storage, 
and a way to see values.

DEVELOPMENT:

Change to the packages/backend directory and run node.

TERMINAL 1: This sets up the environment and starts the server running:

   require('@cocalc/backend/conat/persist').initServer()


TERMINAL 2: In another node session, create a client:

    user = {account_id:'00000000-0000-4000-8000-000000000000'}; storage = {path:'a.db'}; const {id, lifetime, stream} = await require('@cocalc/backend/conat/persist').getAll({user, storage, options:{lifetime:1000*60}}); console.log({id}); for await(const x of stream) { console.log(x.data) }; console.log("DONE")

// client also does this periodically to keep subscription alive:

    await renew({user, id }) 

TERMINAL 3:

user = {account_id:'00000000-0000-4000-8000-000000000000'}; storage = {path:'a.db'}; const {set,get} = require('@cocalc/backend/conat/persist');  const { messageData } =require("@cocalc/conat/core/client"); 0;

   await set({user, storage, messageData:messageData('hi')})
   
   await get({user, storage,  seq:1})
   
   await set({user, storage, key:'bella', messageData:messageData('hi', {headers:{x:10}})})
   
   await get({user, storage,  key:'bella'})
   
Also getAll using start_seq:

   cf = const {id, lifetime, stream} = await require('@cocalc/backend/conat/persist').getAll({user, storage, start_seq:10, options:{lifetime:1000*60}}); for await(const x of stream) { console.log(x) };
*/

import { pstream, type Message as StoredMessage } from "./storage";
import { getEnv } from "@cocalc/conat/client";
import { type Client, type Subscription } from "@cocalc/conat/core/client";
import { uuid } from "@cocalc/util/misc";
import { getLogger } from "@cocalc/conat/client";
import { delay } from "awaiting";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { join } from "path";
import { syncFiles, ensureContainingDirectoryExists } from "./context";
import { is_array } from "@cocalc/util/misc";

// I added an experimental way to run any sqlite query... but it is disabled
// since of course there are major DOS and security concerns.
const ENABLE_SQLITE_GENERAL_QUERIES = false;

// When sending a large number of message for
// getAll or change updates, we combine together messages
// until hitting this size, then send them all at once.
// This bound is to avoid potentially using a huge amount of RAM
// when streaming a large saved database to the client.
// Note: if a single message is larger than this, it still
// gets sent, just individually.
const DEFAULT_MESSAGES_THRESH = 20 * 1e6;
//const DEFAULT_MESSAGES_THRESH = 1e5;

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

export const SUBJECT = "persist";

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

interface Options {
  messagesThresh?: number;
  client?: Client;
}

export async function init({
  client,
  messagesThresh = DEFAULT_MESSAGES_THRESH,
}: Options = {}) {
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
  client = client ?? (await getEnv()).cn;
  // this returns one the service is listening
  await persistService({ client, messagesThresh });
  await renewService({ client });
}

async function noThrow(f) {
  try {
    await f();
  } catch (err) {
    logger.debug(`WARNING -- ${err}`);
  }
}

async function persistService({ client, messagesThresh }) {
  sub = await client.subscribe(`${SUBJECT}.*.api`, {
    queue: "q",
    ephemeral: true,
  });
  listenPersist({ messagesThresh });
}

let renew: Subscription | null = null;
async function renewService({ client }) {
  renew = await client.subscribe(`${SUBJECT}.*.renew`);
  listenRenew();
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

async function listenPersist({ messagesThresh }) {
  if (sub == null) {
    throw Error("must call init first");
  }
  for await (const mesg of sub) {
    //console.log("got mesg = ", { data: mesg.data, headers: mesg.headers });
    if (terminated) {
      return;
    }
    noThrow(async () => await handleMessage({ mesg, messagesThresh }));
  }
}

let numPersists = 0;
const numPersistsPerUser: { [user_id: string]: number } = {};

function metrics() {
  logger.debug("persist", { numPersists });
}

async function handleMessage({ mesg, messagesThresh }) {
  const request = mesg.headers;
  //console.log("handleMessage", { data: mesg.data, headers: mesg.headers });
  const user_id = getUserId(mesg.subject);

  // [ ] TODO: permissions and sanity checks!
  const path = join(syncFiles.local, request.storage.path);
  await ensureContainingDirectoryExists(path);
  const stream = pstream({ ...request.storage, path });

  // get and set using normal request/respond
  try {
    if (request.cmd == "set") {
      const resp = stream.set({
        key: request.key,
        previousSeq: request.previousSeq,
        raw: mesg.raw,
        encoding: mesg.encoding,
        headers: request.headers,
      });
      mesg.respond({ resp });
    } else if (request.cmd == "get") {
      const resp = stream.get({ key: request.key, seq: request.seq });
      //console.log("got resp = ", resp);
      if (resp == null) {
        mesg.respond(null);
      } else {
        const { raw, encoding, headers, seq, time, key } = resp;
        mesg.respond(null, {
          raw,
          encoding,
          headers: { ...headers, seq, time, key },
        });
      }
    } else if (request.cmd == "keys") {
      const resp = stream.keys();
      mesg.respond({ resp });
    } else if (request.cmd == "sqlite") {
      if (!ENABLE_SQLITE_GENERAL_QUERIES) {
        throw Error("sqlite command not currently supported");
      }
      const resp = stream.sqlite(request.statement, request.params);
      mesg.respond({ resp });
    }
  } catch (err) {
    mesg.respond({ error: `${err}` });
  }

  if (request.cmd != "getAll") {
    mesg.respond({ error: `unknown command ${request.cmd}` });
    return;
  }

  await getAll({ mesg, request, user_id, stream, messagesThresh });
}

async function getAll({ mesg, request, user_id, stream, messagesThresh }) {
  //console.log("getAll", request);
  // getAll sends multiple responses
  let seq = 0;
  let lastSend = 0;

  const respond = async (
    error,
    content?:
      | ""
      | { id: string; lifetime: number }
      | { state: "watch" }
      | StoredMessage[],
  ) => {
    if (terminated) {
      end();
    }
    lastSend = Date.now();
    if (!error && is_array(content)) {
      // console.log("content = ", content);
      // StoredMessage
      const messages = content as StoredMessage[];
      await mesg.respond(messages, { headers: { seq } });
    } else {
      await mesg.respond(null, { headers: { error, seq, content } });
    }
    if (error) {
      end();
      return;
    }

    seq += 1;
  };

  const id = uuid();
  numPersists += 1;
  metrics();
  let done = false;
  const end = () => {
    if (done) {
      return;
    }
    done = true;
    delete endOfLife[id];
    numPersists -= 1;
    metrics();
    stream.close();
    // end response stream with empty payload and no headers.
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
    if (!request.end_seq) {
      await respond(undefined, { id, lifetime });
    }
    if (done) {
      return;
    }

    // send the current data
    const messages: any[] = [];
    let size = 0;
    // [ ] TODO: limit the size
    for (const message of stream.getAll({
      start_seq: request.start_seq,
      end_seq: request.end_seq,
    })) {
      messages.push(message);
      size += message.raw.length;
      if (size >= messagesThresh) {
        await respond(undefined, messages);
        messages.length = 0;
        size = 0;
      }
      if (done) return;
    }

    if (messages.length > 0) {
      await respond(undefined, messages);
    }
    if (done) return;

    if (request.end_seq) {
      end();
      return;
    }

    // send state change message
    await respond(undefined, { state: "watch" });

    const unsentMessages: StoredMessage[] = [];
    const sendAllUnsentMessages = reuseInFlight(async () => {
      while (!done && unsentMessages.length > 0) {
        if (done) return;
        // [ ] TODO: limit the size
        const messages: StoredMessage[] = [];
        let size = 0;
        while (unsentMessages.length > 0 && !done) {
          const message = unsentMessages.shift();
          size += message!.raw.length;
          messages.push(message!);
          if (size >= messagesThresh) {
            await respond(undefined, messages);
            if (done) return;
            size = 0;
            messages.length = 0;
          }
        }
        if (done) return;
        await respond(undefined, messages);
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
