/*
To start this standalone

   s = await require('@cocalc/server/conat/socketio').initConatServer()
    
It will also get run integrated with the hub if the --conat-server option is passed in.

How to make a cluster of two servers:

    s1 = await require('@cocalc/server/conat/socketio').initConatServer({port:3000, clusterName:'my-cluster', id:'s1', systemAccountPassword:'x', path:'/'}); 0
    
and in another session:

    s2 = await require('@cocalc/server/conat/socketio').initConatServer({port:3001,  clusterName:'my-cluster', id:'s2', systemAccountPassword:'x', path:'/'}); 0
    
    await s2.join('http://localhost:3000')
    
    s2.clusterTopology()
    
        // { 'my-cluster': { s1: 'http://localhost:3000', s2: 'http://localhost:3001' }}
    
Then in another terminal, make a client connected to each:

    c1 = require('@cocalc/conat/core/client').connect({address:'http://localhost:3000', 
     systemAccountPassword:'x'});
    c2 = require('@cocalc/conat/core/client').connect({address:'http://localhost:3001', 
     systemAccountPassword:'x'});
     
    c1.watch('foo')
    c2.publishSync('foo', 'hi')
    
*/

import {
  init as createConatServer,
  type Options,
} from "@cocalc/conat/core/server";
import { getUser, isAllowed } from "./auth";
import { secureRandomString } from "@cocalc/backend/misc";
import { conatSocketioCount, conatClusterPort } from "@cocalc/backend/data";
import basePath from "@cocalc/backend/base-path";
import port from "@cocalc/backend/port";
import { join } from "path";
import startCluster from "./start-cluster";
import { getLogger } from "@cocalc/backend/logger";
import "@cocalc/backend/conat";
import "@cocalc/backend/conat/persist"; // initializes context

const logger = getLogger("conat-server");

export async function init(options: Partial<Options> = {}) {
  logger.debug("init");

  if (conatClusterPort) {
    const mesg = `Conat cluster port is set so we spawn a cluster listening on port ${conatClusterPort}, instead of an in-process conat server`;
    console.log(mesg);
    logger.debug(mesg);
    startCluster();
    return;
  }

  const opts = {
    getUser,
    isAllowed,
    systemAccountPassword:
      options.systemAccountPassword ?? (await secureRandomString(64)),
    path: join(basePath, "conat"),
    port,
    ...options,
  };

  if (!conatSocketioCount || conatSocketioCount <= 1) {
    return createConatServer(opts);
  } else {
    return createConatServer({
      ...opts,
      localClusterSize: conatSocketioCount,
      clusterName: "default",
      id: "node",
    });
    throw Error(`not implemented -- socket count = ${conatSocketioCount}`);
  }
}
