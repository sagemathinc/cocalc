/*

DEVELOPMENT:

Turn off conat-server handling for the hub for changefeeds by sending this message from a browser as an admin:

   await cc.client.conat_client.hub.system.terminate({service:'changefeeds'})

In a node session:

DEBUG=cocalc*changefeed* DEBUG_CONSOLE=yes node

    require('@cocalc/backend/conat'); require('@cocalc/database/conat/changefeed-api').init()

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
  type SubjectSocket,
} from "@cocalc/conat/hub/changefeeds";

import { db } from "@cocalc/database";
import { conat } from "@cocalc/backend/conat";

let server: SubjectSocket | null = null;
export function init() {
  const D = db();
  server = changefeedServer({
    client: conat(),
    userQuery: D.user_query.bind(D),
    cancelQuery: (id: string) => D.user_query_cancel_changefeed({ id }),
  });
}

export function close() {
  server?.close();
  server = null;
}
