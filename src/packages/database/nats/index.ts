/*


 echo "require('@cocalc/database/nats').init()" | COCALC_MODE='single-user' DEBUG_CONSOLE=yes DEBUG=cocalc:* node

*/

import getLogger from "@cocalc/backend/logger";
import { JSONCodec } from "nats";
import userQuery from "@cocalc/database/user-query";
import { getConnection } from "@cocalc/backend/nats";
import { getUserId } from "@cocalc/nats/api";
import { callback } from "awaiting";
import { db } from "@cocalc/database";
import { SyncTableKV } from "@cocalc/nats/sync/synctable-kv";
import { sha1 } from "@cocalc/backend/misc_node";

const logger = getLogger("database:nats");

const jc = JSONCodec();

export async function init() {
  const subject = "hub.*.*.db";
  logger.debug(`init -- subject='${subject}', options=`, {
    queue: "0",
  });
  const nc = await getConnection();
  const sub = nc.subscribe(subject, { queue: "0" });
  for await (const mesg of sub) {
    handleRequest(mesg, nc);
  }
}

async function handleRequest(mesg, nc) {
  console.log({ subject: mesg.subject });
  let resp;
  try {
    const { account_id, project_id } = getUserId(mesg.subject);
    const { name, args } = jc.decode(mesg.data) ?? ({} as any);
    if (!name) {
      throw Error("api endpoint name must be given in message");
    }
    logger.debug("handling hub db request:", {
      account_id,
      project_id,
      name,
      args,
    });
    resp = await getResponse({ name, args, account_id, project_id, nc });
  } catch (err) {
    resp = { error: `${err}` };
  }
  mesg.respond(jc.encode(resp));
}

async function getResponse({ name, args, account_id, project_id, nc }) {
  if (name == "userQuery") {
    const opts = { ...args[0], account_id, project_id };
    if (opts.changes == null) {
      return await userQuery(opts);
    } else {
      return await createChangefeed(opts, nc);
    }
  } else {
    throw Error(`name='${name}' not implemented`);
  }
}

// This is tricky.  We return the first result as a normal
// async function, but then handle (and don't return)
// the subsequent calls to cb generated by the changefeed.
async function createChangefeed(opts, nc) {
  const query = opts.query;
  const env = { nc, jc, sha1 };
  const synctable = new SyncTableKV({
    query,
    env,
    account_id: opts.account_id,
    project_id: opts.project_id,
  });
  await synctable.init();
  const f = (cb) => {
    let first = true;
    db().user_query({
      ...opts,
      cb: async (err, result) => {
        if (first) {
          first = false;
          cb(err, result);
          if (result != null) {
            for (const x of result[synctable.table]) {
              logger.debug("changefeed init", x);
              await synctable.set(x);
            }
          }
          return;
        }
        logger.debug("changefeed", result);
        const { action, new_val, old_val } = result as any;
        // action = 'insert', 'update', 'delete', 'close'
        // e.g., {"action":"insert","new_val":{"title":"testingxxxxx","project_id":"81e0c408-ac65-4114-bad5-5f4b6539bd0e"}}
        if (action == "insert" || action == "update") {
          await synctable.set(new_val);
        } else if (action == "delete") {
          await synctable.delete(old_val);
        }
      },
    });
  };
  return await callback(f);
}
