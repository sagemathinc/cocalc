/*
This is meant to be similar to the nexts pages http api/v2, but using NATS instead of HTTPS.

To do development:

1. Turn off conat-server handling for the hub by sending this message from a browser as an admin:

   await cc.client.conat_client.hub.system.terminate({service:'api'})

NOTE: there's no way to turn the auth back on in the hub, so you'll have to restart
your dev hub after doing the above.

2. Run this script at the terminal:

    echo "require('@cocalc/server/conat/api').initAPI()" | COCALC_MODE='single-user' DEBUG_CONSOLE=yes DEBUG=cocalc:* node


3. Optional: start more servers -- requests get randomly routed to exactly one of them:

    echo "require('@cocalc/server/conat').default()" | COCALC_MODE='single-user' DEBUG_CONSOLE=yes DEBUG=cocalc:* node
    echo "require('@cocalc/server/conat').default()" | COCALC_MODE='single-user' DEBUG_CONSOLE=yes DEBUG=cocalc:* node


To make use of this from a browser:

    await cc.client.conat_client.hub.system.getCustomize(['siteName'])

or

    await cc.client.conat_client.callHub({name:"system.getCustomize", args:[['siteName']]})

When you make changes, just restart the above.  All clients will instantly
use the new version after you restart, and there is no need to restart the hub
itself or any clients.

To view requests in realtime

cd packages/backend
pnpm conat-watch 'hub.*.*.api' --match-replies

*/

import getLogger from "@cocalc/backend/logger";
import { type HubApi, getUserId, transformArgs } from "@cocalc/conat/hub/api";
import { conat } from "@cocalc/backend/conat";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import { close as terminateChangefeedServer } from "@cocalc/database/conat/changefeed-api";
import { close as terminatePersistServer } from "@cocalc/backend/conat/persist";
import { delay } from "awaiting";

const logger = getLogger("server:conat:api");

export function initAPI() {
  mainLoop();
}

let terminate = false;
async function mainLoop() {
  let d = 3000;
  let lastStart = 0;
  while (!terminate) {
    try {
      lastStart = Date.now();
      await serve();
    } catch (err) {
      logger.debug(`hub conat api service error -- ${err}`);
      if (Date.now() - lastStart >= 30000) {
        // it ran for a while, so no delay
        logger.debug(`will restart immediately`);
        d = 3000;
      } else {
        // it crashed quickly, so delay!
        d = Math.min(20000, d * 1.25 + Math.random());
        logger.debug(`will restart in ${d}ms`);
        await delay(d);
      }
    }
  }
}

async function serve() {
  const subject = "hub.*.*.api";
  logger.debug(`initAPI -- subject='${subject}', options=`, {
    queue: "0",
  });
  const cn = await conat({ noCache: true });
  const api = await cn.subscribe(subject, { queue: "0" });
  for await (const mesg of api) {
    (async () => {
      try {
        await handleMessage({ api, subject, mesg });
      } catch (err) {
        logger.debug(`WARNING: unexpected error  - ${err}`);
      }
    })();
  }
}

async function handleMessage({ api, subject, mesg }) {
  const request = mesg.data ?? ({} as any);
  if (request.name == "system.terminate") {
    // special hook so admin can terminate handling. This is useful for development.
    const { account_id } = getUserId(mesg.subject);
    if (!(!!account_id && (await userIsInGroup(account_id, "admin")))) {
      mesg.respond({ error: "only admin can terminate" }, { noThrow: true });
      return;
    }
    // TODO: could be part of handleApiRequest below, but done differently because
    // one case halts this loop
    const { service } = request.args[0] ?? {};
    logger.debug(`Terminate service '${service}'`);
    if (service == "changefeeds") {
      terminateChangefeedServer();
      mesg.respond({ status: "terminated", service }, { noThrow: true });
      return;
    } else if (service == "persist") {
      terminatePersistServer();
      mesg.respond({ status: "terminated", service }, { noThrow: true });
      return;
    } else if (service == "api") {
      // special hook so admin can terminate handling. This is useful for development.
      console.warn("TERMINATING listening on ", subject);
      logger.debug("TERMINATING listening on ", subject);
      terminate = true;
      mesg.respond({ status: "terminated", service }, { noThrow: true });
      api.stop();
      return;
    } else {
      mesg.respond({ error: `Unknown service ${service}` }, { noThrow: true });
    }
  } else {
    // we explicitly do NOT await this, since we want this hub server to handle
    // potentially many messages at once, not one at a time!
    handleApiRequest({ request, mesg });
  }
}

async function handleApiRequest({ request, mesg }) {
  let resp;
  try {
    const { account_id, project_id } = getUserId(mesg.subject);
    const { name, args } = request as any;
    logger.debug("handling hub.api request:", {
      account_id,
      project_id,
      name,
    });
    resp = (await getResponse({ name, args, account_id, project_id })) ?? null;
  } catch (err) {
    resp = { error: `${err}` };
  }
  try {
    await mesg.respond(resp);
  } catch (err) {
    // there's nothing we can do here, e.g., maybe NATS just died.
    logger.debug(
      `WARNING: error responding to hub.api request (client will receive no response) -- ${err}`,
    );
  }
}

import * as purchases from "./purchases";
import * as db from "./db";
import * as system from "./system";
import * as projects from "./projects";
import * as jupyter from "./jupyter";
import * as sync from "./sync";
import * as org from "./org";
import * as messages from "./messages";

export const hubApi: HubApi = {
  system,
  projects,
  db,
  purchases,
  jupyter,
  sync,
  org,
  messages,
};

async function getResponse({ name, args, account_id, project_id }) {
  const [group, functionName] = name.split(".");
  const f = hubApi[group]?.[functionName];
  if (f == null) {
    throw Error(`unknown function '${name}'`);
  }
  const args2 = await transformArgs({
    name,
    args,
    account_id,
    project_id,
  });
  return await f(...args2);
}
