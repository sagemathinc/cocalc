/*
To start this standalone

pnpm conat-server


It will also get run integrated with the hub if the --conat-server option is passed in
*/

import { init as createConatServer } from "@cocalc/nats/server/server";
import { Server } from "socket.io";
import { getLogger } from "@cocalc/backend/logger";
const logger = getLogger("conat-server");

export function init({
  port,
  httpServer,
}: { port?: number; httpServer? } = {}) {
  logger.debug("init", { port, httpServer: httpServer != null });

  createConatServer({ port, httpServer, Server, logger: logger.debug });
}
