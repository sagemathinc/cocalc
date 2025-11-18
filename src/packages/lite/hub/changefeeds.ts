/*
DEVELOPMENT:

In a node session:

DEBUG=cocalc*changefeed* DEBUG_CONSOLE=yes node

    require('@cocalc/lite/hub/changefeed').init()

In another session:

    require('@cocalc/backend/conat'); c = require('@cocalc/conat/changefeed/client');
    account_id = '6aae57c6-08f1-4bb5-848b-3ceb53e61ede';
    cf = await c.changefeed({account_id,query:{accounts:[{account_id, first_name:null}]}, heartbeat:5000, lifetime:30000});

    const {value:{id}} = await cf.next();
    console.log({id});
    for await (const x of cf) { console.log(new Date(), {x}); }

    await c.renew({account_id, id})
*/

import {
  changefeedServer,
  type ConatSocketServer,
} from "@cocalc/conat/hub/changefeeds";
import { type Client } from "@cocalc/conat/core/client";
import userQuery, { cancelQuery } from "./sqlite/user-query";
import getLogger from "@cocalc/backend/logger";
const logger = getLogger("lite:hub:changefeeds");

let server: ConatSocketServer | null = null;
export function init({ client }: { client: Client }) {
  logger.debug("init changefeedServer", { address: client.options.address });
  server = changefeedServer({
    client,
    userQuery,
    cancelQuery,
  });
}

export function close() {
  server?.close();
  server = null;
}
