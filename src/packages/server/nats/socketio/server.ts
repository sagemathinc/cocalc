/*
To start this standalone

   s = await require('@cocalc/server/nats/socketio').initConatServer()
    
It will also get run integrated with the hub if the --conat-server option is passed in.

Using valkey

    s1 = await require('@cocalc/server/nats/socketio').initConatServer({port:3000, valkey:'redis://127.0.0.1:6379'})
    
and in another session:

    s2 = await require('@cocalc/server/nats/socketio').initConatServer({port:3001, valkey:'redis://127.0.0.1:6379'})
    
Then make a client connected to each:

    c1 = require('@cocalc/nats/server/client').connect('http://localhost:3000');
    c2 = require('@cocalc/nats/server/client').connect('http://localhost:3001');
*/

import { init as createConatServer } from "@cocalc/nats/server/server";
import { Server } from "socket.io";
import { getLogger } from "@cocalc/backend/logger";
import { getUser, isAllowed } from "./auth";

const logger = getLogger("conat-server");

export async function init({
  port,
  httpServer,
  path,
  valkey = process.env.VALKEY,
}: { port?: number; httpServer?; path?: string; valkey?: string } = {}) {
  logger.debug("init", { port, httpServer: httpServer != null, path, valkey });

  const server = createConatServer({
    port,
    httpServer,
    Server,
    logger: logger.debug,
    path,
    getUser,
    isAllowed,
    valkey,
  });

  // This might enable uWebosckets.js?
  // pnpm i uws-pack
  // Then uncomment the following
  /*
  // @ts-ignore
  const { App } = await import("uws-pack");
  const app = App();
  server.io.attachApp(app);
  */

  return server;
}
