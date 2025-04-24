/*

DEVELOPMENT:

Turn off nats-server handling for the hub for changefeeds by sending this message from a browser as an admin:

   await cc.client.nats_client.hub.system.terminate({service:'changefeeds'})

In a node session:

    require('@cocalc/backend/nats'); require('@cocalc/database/nats/changefeed-api').init()

In another session:

    require('@cocalc/backend/nats'); c = require('@cocalc/nats/changefeed/client');
    account_id = '6aae57c6-08f1-4bb5-848b-3ceb53e61ede';
    cf = await c.changefeed({account_id,query:{accounts:[{account_id, first_name:null}]}, heartbeat:5000, lifetime:30000});

    const {value:{id}} = await cf.next();
    console.log({id});
    for await (const x of cf) { console.log(new Date(), {x}); }

    await c.renew({account_id, id})
*/

import { init as initChangefeedServer } from "@cocalc/nats/changefeed/server";
import { db } from "@cocalc/database";
import "@cocalc/backend/nats";

export function init() {
  initChangefeedServer(db);
}
