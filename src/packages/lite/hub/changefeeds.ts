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
import { conat } from "@cocalc/backend/conat";

let server: ConatSocketServer | null = null;
export function init() {
  server = changefeedServer({
    client: conat(),
    userQuery,
    cancelQuery: (id: string) => {
      console.log("todo: cancelQuery", id);
    },
  });
}

export function close() {
  server?.close();
  server = null;
}

function userQuery({
  query,
  cb,
}: {
  query: object;
  options?: object[];
  account_id: string;
  changes: string;
  cb: Function;
}): void {
  const table = Object.keys(query)[0];
  if (table == "accounts") {
    cb(undefined, {
      accounts: [
        {
          account_id: "00000000-0000-4000-8000-000000000000",
          email_address: "user@cocalc.com",
        },
      ],
    });
    return;
  }
  cb(undefined, { [table]: [] });
}
