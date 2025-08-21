import startProjectServices from "@cocalc/project/conat";
import getPort from "@cocalc/backend/get-port";
import {
  init as createConatServer,
  type ConatServer,
} from "@cocalc/conat/core/server";
import { server as createPersistServer } from "@cocalc/backend/conat/persist";
import { type Client } from "@cocalc/conat/core/client";
import { setConatClient } from "@cocalc/conat/client";
import { once } from "@cocalc/util/async-utils";
import { setConatServer } from "@cocalc/backend/data";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("lite:main");

export let conatServer: ConatServer | null = null;
export let persistServer: any = null;

function conat(opts?): Client {
  if (conatServer == null) {
    throw Error("not initialized");
  }
  return conatServer.client({ path: "/", ...opts });
}

export async function main() {
  const options = { port: await getPort(), path: "/" };
  
  logger.debug("main: create server");
  conatServer = createConatServer(options);
  if (conatServer.state != "ready") {
    await once(conatServer, "ready");
  }
  logger.debug(conatServer.address());
  setConatServer(conatServer.address());

  logger.debug("main: create client");
  const conatClient = conat();
  setConatClient({ conat, getLogger });
  
  logger.debug("main: create persist server");
  persistServer = createPersistServer({ client: conatClient });
  
  logger.debug("main: start project services");
  await startProjectServices();
}
