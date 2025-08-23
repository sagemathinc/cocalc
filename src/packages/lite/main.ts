import startProjectServices from "@cocalc/project/conat";
import { cleanup } from "@cocalc/project/project-setup";
import {
  init as createConatServer,
  type ConatServer,
} from "@cocalc/conat/core/server";
import { server as createPersistServer } from "@cocalc/backend/conat/persist";
import { type Client } from "@cocalc/conat/core/client";
import { setConatClient } from "@cocalc/conat/client";
import { once } from "@cocalc/util/async-utils";
import { setConatServer } from "@cocalc/backend/data";
import { project_id } from "@cocalc/project/data";
import { init as initHttpServer } from "./http";
import { localPathFileserver } from "@cocalc/backend/conat/files/local-path";
import { init as initBugCounter } from "@cocalc/project/bug-counter";
import { init as initChangefeeds} from "./hub/changefeeds"

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

export async function main() : Promise<number> {
  logger.debug("main");

  process.chdir(process.env.HOME ?? "")
  initBugCounter();

  logger.debug("start http server");
  const { httpServer, port } = await initHttpServer();

  logger.debug("create server");
  const options = {
    httpServer,
    port,
    getUser: async () => {
      return { account_id: "00000000-0000-4000-8000-000000000000" };
    },
  };
  conatServer = createConatServer(options);
  if (conatServer.state != "ready") {
    await once(conatServer, "ready");
  }
  logger.debug(conatServer.address());
  setConatServer(conatServer.address());

  logger.debug("create client");
  const conatClient = conat();
  setConatClient({ conat, getLogger });

  logger.debug("create persist server");
  persistServer = createPersistServer({ client: conatClient });

  logger.debug("start project services");
  cleanup();
  startProjectServices();

  logger.debug("start changefeed server");
  initChangefeeds();
  
  logger.debug("start fs service");
  localPathFileserver({
    client: conatClient,
    path: process.cwd(),
    project_id,
    unsafeMode: true,
  });

  process.once("exit", () => {
    conatServer?.close();
    conatServer = null;
    httpServer?.close();
  });

  ["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) => {
    process.once(sig, () => {
      process.exit();
    });
  });
  
  return port;
}
