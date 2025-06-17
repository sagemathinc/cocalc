/*
To start this standalone

   s = await require('@cocalc/server/conat/socketio').initConatServer()
    
It will also get run integrated with the hub if the --conat-server option is passed in.

Using valkey

    s1 = await require('@cocalc/server/conat/socketio').initConatServer({port:3000, valkey:'valkey://127.0.0.1:6379'})
    
or an example using an environment varaible and a password:

    CONAT_VALKEY=valkey://:test-password@127.0.0.1:6379 node
    ... 
    > s1 = await require('@cocalc/server/conat/socketio').initConatServer({port:3000})
    
    
and in another session:

    s2 = await require('@cocalc/server/conat/socketio').initConatServer({port:3001, valkey:'valkey://127.0.0.1:6379'})
    
Then make a client connected to each:

    c1 = require('@cocalc/conat/core/client').connect('http://localhost:3000');
    c2 = require('@cocalc/conat/core/client').connect('http://localhost:3001');
    
*/

import {
  init as createConatServer,
  type Options,
} from "@cocalc/conat/core/server";
import { getLogger } from "@cocalc/backend/logger";
import { getUser, isAllowed } from "./auth";
import { secureRandomString } from "@cocalc/backend/misc";
import {
  conatValkey,
  conatSocketioCount,
  valkeyPassword,
} from "@cocalc/backend/data";
import basePath from "@cocalc/backend/base-path";
import port from "@cocalc/backend/port";
import { join } from "path";

const logger = getLogger("conat-server");

export async function init(options: Partial<Options> = {}) {
  logger.debug("init");
  let valkey: undefined | string | any = undefined;
  if (valkeyPassword) {
    // only hope is making valkey an object
    valkey = { password: valkeyPassword };
    if (conatValkey) {
      const i = conatValkey.lastIndexOf("/");
      const x = conatValkey.slice(i + 1);
      const v = x.split(":");
      valkey.host = v[0] ?? "localhost";
      valkey.port = v[1] ? parseInt(v[1]) : 6379;
    }
  } else if (conatValkey) {
    valkey = conatValkey;
  }

  const opts = {
    logger: logger.debug,
    getUser,
    isAllowed,
    systemAccountPassword: await secureRandomString(64),
    valkey,
    path: join(basePath, "conat"),
    port,
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
