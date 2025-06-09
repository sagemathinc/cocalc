/*
To start this standalone

   s = await require('@cocalc/server/conat/socketio').initConatServer()
    
It will also get run integrated with the hub if the --conat-server option is passed in.

Using valkey

    s1 = await require('@cocalc/server/conat/socketio').initConatServer({port:3000, valkey:'redis://127.0.0.1:6379'})
    
and in another session:

    s2 = await require('@cocalc/server/conat/socketio').initConatServer({port:3001, valkey:'redis://127.0.0.1:6379'})
    
Then make a client connected to each:

    c1 = require('@cocalc/conat/core/client').connect('http://localhost:3000');
    c2 = require('@cocalc/conat/core/client').connect('http://localhost:3001');
    
*/

import {
  init as createConatServer,
  type Options,
} from "@cocalc/conat/core/server";
import { Server } from "socket.io";
import { getLogger } from "@cocalc/backend/logger";
import { getUser, isAllowed } from "./auth";
import { secureRandomString } from "@cocalc/backend/misc";
import { conatValkey, conatSocketioCount } from "@cocalc/backend/data";

const logger = getLogger("conat-server");

export async function init(options: Partial<Options> = {}) {
  logger.debug("init");

  const opts = {
    logger: logger.debug,
    Server,
    getUser,
    isAllowed,
    systemAccountPassword: await secureRandomString(64),
    valkey: conatValkey,
    ...options,
  };

  if (!conatSocketioCount || conatSocketioCount <= 1) {
    return createConatServer(opts);
  } else {
    // spawn conatSocketioCount subprocesses listening on random available ports
    // and all connected to valkey.   Proxy traffic to them.
    throw Error(`not implemented -- socket count = ${conatSocketioCount}`);
  }
}
