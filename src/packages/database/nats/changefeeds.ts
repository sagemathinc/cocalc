/*

1. turn off nats-server handling for the hub by sending this message from a browser as an admin:

   await cc.client.nats_client.hub.system.terminate({service:'db'})

2. Run this

   require("@cocalc/database/nats/changefeeds").init()

   echo 'require("@cocalc/database/nats/changefeeds").init()' | node

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

const logger = getLogger("database:nats:changefeeds");

const jc = JSONCodec();

let api: any | null = null;
export async function init() {
  const subject = "hub.*.*.db";
  logger.debug(`init -- subject='${subject}', options=`, {
    queue: "0",
  });
  const nc = await getConnection();

  // @ts-ignore
  const svcm = new Svcm(nc);

  const service = await svcm.add({
    name: "db-server",
    version: "0.1.0",
    description: "CoCalc Database Service (changefeeds)",
  });

  api = service.addEndpoint("api", { subject });

  for await (const mesg of api) {
    handleRequest(mesg, nc);
  }
}

export function terminate() {
  logger.debug("terminating service");
  api?.stop();
  api = null;
  // also, stop reporting data into the streams
  cancelAllChangefeeds();
}

async function handleRequest(mesg, nc) {
  let resp;
  try {
    const { account_id, project_id } = getUserId(mesg.subject);
    const { name, args } = jc.decode(mesg.data) ?? ({} as any);
    // logger.debug(`got request: "${JSON.stringify({ name, args })}"`);
    if (!name) {
      throw Error("api endpoint name must be given in message");
    }
    //     logger.debug("handling server='db' request:", {
    //       account_id,
    //       project_id,
    //       name,
    //     });
    resp = await getResponse({ name, args, account_id, project_id, nc });
  } catch (err) {
    // logger.debug("ERROR", err);
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

const changefeedHashes: { [id: string]: string } = {};
const changefeedInterest: { [hash: string]: number } = {};
const changefeedSynctables: { [hash: string]: any } = {};

function cancelChangefeed(id) {
  logger.debug("cancelChangefeed", { id });
  const hash = changefeedHashes[id];
  if (!hash) {
    // already canceled
    return;
  }
  changefeedSynctables[hash]?.close();
  delete changefeedSynctables[hash];
  delete changefeedInterest[hash];
  delete changefeedHashes[id];
  db().user_query_cancel_changefeed({ id });
}

function cancelAllChangefeeds() {
  logger.debug("cancelAllChangefeeds");
  for (const id in changefeedHashes) {
    cancelChangefeed(id);
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
    const hash = sha1(
      jsonStableStringify({
        query,
        ...user,
      }),
    );
    const now = Date.now();
    if (changefeedInterest[hash]) {
      changefeedInterest[hash] = now;
      logger.debug("using existing changefeed for", queryTable(query), user);
      return;
    }
    logger.debug("creating new changefeed for", queryTable(query), user);
    const changes = uuid();
    changefeedHashes[changes] = hash;
    const env = { nc, jc, sha1 };
    // If you change any settings below, you might also have to change them in
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
      cancelChangefeed(changes);
    }

    //     if (global.z == null) {
    //       global.z = {};
    //     }
    //     global.z[synctable.table] = synctable;

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
          console.log("remove from synctable", key);
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
        cancelChangefeed(changes);
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
      changefeedInterest[hash] = Date.now();

      const watch = async () => {
        // it's all setup and running.  If there's no interest for a while, stop watching
        while (true) {
          await delay(CHANGEFEED_INTEREST_PERIOD_MS);
          if (
            Date.now() - changefeedInterest[hash] >
            CHANGEFEED_INTEREST_PERIOD_MS
          ) {
            logger.debug(
              "insufficient interest in the changefeed, so we stop it.",
              query,
            );
            cancelChangefeed(changes);
            return;
          }
        }
      };

      // do not block on this.
      watch();
      return;
    } catch (err) {
      // if anything goes wrong, make sure we don't think the changefeed is working.
      cancelChangefeed(changes);
      throw err;
    }
  },
  { createKey: (args) => jsonStableStringify(args[0]) },
);
