/* 
This is meant to be similar to the nexts pages http api/v2, but using NATS instead of HTTPS.

To do development turn off nats-server handling for the hub, and run this script standalone:

    echo "require('@cocalc/server/nats').default()" | COCALC_MODE='single-user' DEBUG_CONSOLE=yes DEBUG=cocalc:* node
    
Optional: start more servers -- requests get randomly routed to exactly one of them:

    echo "require('@cocalc/server/nats').default()" | COCALC_MODE='single-user' DEBUG_CONSOLE=yes DEBUG=cocalc:* node
    echo "require('@cocalc/server/nats').default()" | COCALC_MODE='single-user' DEBUG_CONSOLE=yes DEBUG=cocalc:* node
    
    
To make use of this from a browser:

    await cc.client.nats_client.api({name:"customize", args:{fields:['siteName']}})

When you make changes, just restart the above.  All clients will instantly 
use the new version after you restart, and there is no need to restart the hub 
itself or any clients.

To view all requests (and replies) in realtime:

    nats sub api.v2 --match-replies 
*/

import { JSONCodec } from "nats";
import getLogger from "@cocalc/backend/logger";
import { type HubApi, getUserId } from "@cocalc/nats/api/index";

const logger = getLogger("server:nats:api");

const jc = JSONCodec();

export async function initAPI(nc) {
  const subject = "hub.*.*.api";
  logger.debug(`initAPI -- subject='${subject}', options=`, {
    queue: "0",
  });
  const sub = nc.subscribe(subject, { queue: "0" });
  for await (const mesg of sub) {
    handleApiRequest(mesg);
  }
}

async function handleApiRequest(mesg) {
  console.log({ subject: mesg.subject });
  let resp;
  try {
    const { account_id, project_id } = getUserId(mesg.subject);
    const request = jc.decode(mesg.data) ?? {};
    const { name, args } = request as any;
    logger.debug("handling hub.api request:", {
      account_id,
      project_id,
      name,
      args,
    });
    resp = await getResponse({ name, args, account_id, project_id });
  } catch (err) {
    resp = { error: `${err}` };
  }
  mesg.respond(jc.encode(resp));
}

import userQuery from "@cocalc/database/user-query";
import getCustomize from "@cocalc/database/settings/customize";

const hubApi: HubApi = {
  getCustomize,
  userQuery,
};

async function getResponse({ name, args, account_id, project_id }) {
  const f = hubApi[name];
  if (f == null) {
    throw Error(`unknown function '${name}'`);
  }
  if (name == "userQuery" && args[0] != null) {
    if (account_id) {
      args[0].account_id = account_id;
    } else if (project_id) {
      args[0].project_id = project_id;
    }
  }
  return await f(...args);
}
