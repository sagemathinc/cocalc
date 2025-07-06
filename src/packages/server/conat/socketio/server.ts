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
import "@cocalc/backend/conat";
import "@cocalc/backend/conat/persist"; // initializes context
import { dnsScan } from "./dns-scan";
import { health } from "./health";
import { getLogger } from "@cocalc/backend/logger";

const logger = getLogger("conat-server");

export async function init(
  options0: Partial<Options> & { kucalc?: boolean } = {},
) {
  logger.debug("init");
  const { kucalc, ...options } = options0;

  if (kucalc) {
    // In Kubernetes we do two things differently:
    //   - the server id is derived from the hostname
    //   - we use dns to periodically lookup the other servers and join to them.
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

  if (kucalc) {
    const server = createConatServer(opts);
    // enable dns scanner
    dnsScan(server);
    // enable health checks
    health(server);
    return server;
  }

  if ((conatSocketioCount ?? 1) <= 1) {
    return createConatServer(opts);
  } else {
    return createConatServer({
      ...opts,
      ssl: false,
      httpServer: undefined,
      port: conatClusterPort,
      localClusterSize: conatSocketioCount,
      clusterName: "default",
      id: "node",
    });
  }
}
