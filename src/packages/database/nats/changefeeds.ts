/*

What this does:

A backend server gets a request that a given changefeed (e.g., "messages" or
"projects" for a given user) needs to be managed. For a while, the server will
watch the datϨabase and put entries in a NATS jetstream kv that represents the
data. The browser also periodically pings the backend saying "I'm still
interested in this changefeed" and the backend server keeps up watching postgres
for changes. When the user is gone for long enough (5 minutes?) the backend
stops watching and just leaves the data as is in NATS.

When the user comes back, they immediately get the last version of the data
straight from NATS, and their browser says "I'm interested in this changefeed".
The changefeed then gets updated (hopefully 1-2 seconds later) and periodically
updated after that.


DEVELOPMENT:

1. turn off nats-server handling for the hub by sending this message from a browser as an admin:

   await cc.client.nats_client.hub.system.terminate({service:'db'})

2. Run this line in nodejs right here:

   require("@cocalc/database/nats/changefeeds").init()


*/

import getLogger from "@cocalc/backend/logger";
import { JSONCodec } from "nats";
import userQuery from "@cocalc/database/user-query";
import { getConnection } from "@cocalc/backend/nats";
import { getUserId } from "@cocalc/nats/hub-api";
import { callback } from "awaiting";
import { db } from "@cocalc/database";
import {
  createSyncTable,
  CHANGEFEED_INTEREST_PERIOD_MS,
} from "@cocalc/nats/sync/synctable";
import { sha1 } from "@cocalc/backend/misc_node";
import jsonStableStringify from "json-stable-stringify";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { uuid } from "@cocalc/util/misc";
import { delay } from "awaiting";
import { Svcm } from "@nats-io/services";
import { Coordinator, now } from "./coordinator";

const logger = getLogger("database:nats:changefeeds");

const jc = JSONCodec();

const LOCK_TIMEOUT_MS = 30000;

export async function init() {
  while (true) {
    try {
      await mainLoop();
    } catch (err) {
      logger.debug(`error running mainLoop -- ${err}`);
    }
    await delay(15000);
  }
}

let api: any | null = null;
let coordinator: null | Coordinator = null;
async function mainLoop() {
  const subject = "hub.*.*.db";
  logger.debug(`init -- subject='${subject}', options=`);
  coordinator = new Coordinator({ timeout: LOCK_TIMEOUT_MS });
  await coordinator.init();
  const nc = await getConnection();

  // @ts-ignore
  const svcm = new Svcm(nc);

  const service = await svcm.add({
    name: "db-server",
    version: "0.2.0",
    description: "CoCalc Database Service (changefeeds)",
    queue: "0",
  });

  api = service.addEndpoint("api", { subject });

  try {
    for await (const mesg of api) {
      handleRequest({ mesg, nc });
    }
  } finally {
    cancelAllChangefeeds();
    try {
      await coordinator?.close();
    } catch (err) {
      logger.debug("error closing coordinator", err);
    }
    coordinator = null;
  }
}

export function terminate() {
  logger.debug("terminating service");
  api?.stop();
  api = null;
  // also, stop reporting data into the streams
  cancelAllChangefeeds();
}

async function handleRequest({ mesg, nc }) {
  let resp;
  try {
    const { account_id, project_id } = getUserId(mesg.subject);
    const { name, args } = jc.decode(mesg.data) ?? ({} as any);
    //console.log(`got request: "${JSON.stringify({ name, args })}"`);
    // logger.debug(`got request: "${JSON.stringify({ name, args })}"`);
    if (!name) {
      throw Error("api endpoint name must be given in message");
    }
    //     logger.debug("handling server='db' request:", {
    //       account_id,
    //       project_id,
    //       name,
    //     });
    resp = await getResponse({
      name,
      args,
      account_id,
      project_id,
      nc,
    });
  } catch (err) {
    logger.debug(`ERROR -- ${err}`);
    resp = { error: `${err}` };
  }
  // logger.debug(`Responding with "${JSON.stringify(resp)}"`);
  mesg.respond(jc.encode(resp));
}

async function getResponse({ name, args, account_id, project_id, nc }) {
  if (name == "userQuery") {
    const opts = { ...args[0], account_id, project_id };
    if (!opts.changes) {
      // a normal query
      return await userQuery(opts);
    } else {
      return await createChangefeed(opts, nc);
    }
  } else {
    throw Error(`name='${name}' not implemented`);
  }
}

function queryTable(query) {
  return Object.keys(query)[0];
}

// changefeedHashes maps changes (database changefeed id) to hash
const changefeedHashes: { [id: string]: string } = {};
// changefeedChanges maps hash to changes.
const changefeedChanges: { [hash: string]: string } = {};
// changefeedInterest maps hash to time
const changefeedInterest: { [hash: string]: number } = {};
// changefeedSynctables maps hash to SyncTable
const changefeedSynctables: { [hash: string]: any } = {};

function cancelChangefeed({
  hash,
  changes,
}: {
  hash?: string;
  changes?: string;
}) {
  logger.debug("cancelChangefeed", { changes, hash });
  if (changes && !hash) {
    hash = changefeedHashes[changes];
  } else if (hash && !changes) {
    changes = changefeedChanges[hash];
  } else {
    // nothing
    return;
  }
  if (!hash || !changes) {
    // already canceled
    return;
  }
  coordinator?.unlock(hash);
  changefeedSynctables[hash]?.close();
  delete changefeedSynctables[hash];
  delete changefeedInterest[hash];
  delete changefeedHashes[changes];
  delete changefeedChanges[hash];
  db().user_query_cancel_changefeed({ id: changes });
}

function cancelAllChangefeeds() {
  logger.debug("cancelAllChangefeeds");
  for (const changes in changefeedHashes) {
    cancelChangefeed({ changes });
  }
}

// This is tricky.  We return the first result as a normal
// async function, but then handle (and don't return)
// the subsequent calls to cb generated by the changefeed.
const createChangefeed = reuseInFlight(
  async (opts, nc) => {
    const query = opts.query;
    // the query *AND* the user making it define the thing:
    const user = { account_id: opts.account_id, project_id: opts.project_id };
    const desc = jsonStableStringify({
      query,
      ...user,
    });
    const hash = sha1(desc);
    if (coordinator == null) {
      logger.debug("coordinator is not defined");
      return;
    }

    // ALWAYS update that a user is interested in this changefeed
    coordinator.updateUserInterest(hash);

    const manager = coordinator.getManagerId(hash);
    logger.debug("createChangefeed -- considering: ", {
      table: queryTable(query),
      hash,
      managerId: coordinator.managerId,
      manager,
    });
    if (manager && coordinator.managerId != manager) {
      logger.debug("somebody else is the manager", { hash });
      if (changefeedInterest[hash]) {
        logger.debug("we are also managing it right now, so cancel it", {
          hash,
        });
        cancelChangefeed({ hash });
        return;
      }
      return;
    }
    // take it
    coordinator.lock(hash);

    if (changefeedInterest[hash]) {
      changefeedInterest[hash] = now();
      logger.debug("use existing changefeed", {
        hash,
        table: queryTable(query),
        user,
      });
      return;
    }
    logger.debug("create new changefeed", queryTable(query), user);
    const changes = uuid();
    changefeedHashes[changes] = hash;
    changefeedChanges[hash] = changes;
    logger.debug(
      "managing ",
      Object.keys(changefeedHashes).length,
      "changefeeds",
    );
    const env = { nc, jc, sha1 };
    // If you change any settings below (i.e., atomic or immutable), you might also have to change them in
    //   src/packages/sync/table/changefeed-nats.ts
    const synctable = createSyncTable({
      query,
      env,
      account_id: opts.account_id,
      project_id: opts.project_id,
      // atomic = false is just way too slow due to the huge number of distinct
      // messages, which NATS is not as good with.
      atomic: true,
      immutable: false,
    });
    changefeedSynctables[hash] = synctable;

    try {
      await synctable.init();
    } catch (err) {
      logger.debug(`Error initializing changefeed -- ${err}`, { hash });
      cancelChangefeed({ changes });
    }

    const handleFirst = ({ cb, err, rows }) => {
      if (err || rows == null) {
        cb(err ?? "missing result");
        return;
      }
      const current = synctable.get();
      const databaseKeys = new Set<string>();
      for (const obj of rows) {
        databaseKeys.add(synctable.getKey(obj));
        synctable.set(obj);
      }
      for (const key in current) {
        if (!databaseKeys.has(key)) {
          // console.log("remove from synctable", key);
          synctable.delete(key);
        }
      }
      cb();
    };

    const handleUpdate = ({ action, new_val, old_val }) => {
      // action = 'insert', 'update', 'delete', 'close'
      // e.g., {"action":"insert","new_val":{"title":"testingxxxxx","project_id":"81e0c408-ac65-4114-bad5-5f4b6539bd0e"}}
      const obj = new_val ?? old_val;
      if (obj == null) {
        // nothing we can do with this
        return;
      }
      if (action == "insert" || action == "update") {
        const cur = synctable.get(new_val);
        // logger.debug({ table: queryTable(query), action, new_val, old_val });
        synctable.set({ ...cur, ...new_val });
      } else if (action == "delete") {
        synctable.delete(old_val);
      } else if (action == "close") {
        cancelChangefeed({ changes });
      }
    };

    const f = (cb) => {
      let first = true;
      db().user_query({
        ...opts,
        changes,
        cb: (err, x) => {
          if (first) {
            first = false;
            handleFirst({ cb, err, rows: x?.[synctable.table] });
            return;
          }
          handleUpdate(x as any);
        },
      });
    };
    try {
      await callback(f);
      // it's running successfully
      changefeedInterest[hash] = now();
      let done = false;

      const watchManagerState = async () => {
        while (!done) {
          await delay(LOCK_TIMEOUT_MS / 1.5);
          if (done) {
            return;
          }
          if (coordinator == null) {
            done = true;
            return;
          }
          const manager = coordinator.getManagerId(hash);
          if (manager != coordinator.managerId) {
            // we are no longer the manager
            cancelChangefeed({ changes });
            done = true;
            return;
          }
          // update the lock
          coordinator.lock(hash);
        }
      };

      const watchUserInterest = async () => {
        // it's all setup and running.  If there's no interest for a while, stop watching
        while (!done) {
          await delay(CHANGEFEED_INTEREST_PERIOD_MS);
          if (done) {
            return;
          }
          if (
            now() - changefeedInterest[hash] >
            CHANGEFEED_INTEREST_PERIOD_MS
          ) {
            // we check both the local known interest *AND* interest recorded by any other servers!
            const last = coordinator?.getUserInterest(hash) ?? 0;
            if (now() - last >= CHANGEFEED_INTEREST_PERIOD_MS) {
              logger.debug(
                "insufficient interest in the changefeed, so we cancel it",
                hash,
                query,
              );
              cancelChangefeed({ changes });
              done = true;
              return;
            }
          }
        }
      };

      // do not block on this.
      watchUserInterest();
      watchManagerState();
      return;
    } catch (err) {
      // if anything goes wrong, make sure we don't think the changefeed is working.
      cancelChangefeed({ changes });
      throw err;
    }
  },
  { createKey: (args) => jsonStableStringify(args[0])! },
);
