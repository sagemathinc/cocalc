/*
Launching it like this:

PORT=30000 COMPUTE_SERVER='http://localhost:9001?apiKey=sk-p2P7iMlc5sJ4pbQ9000005&id=1'  pnpm app

make it:

- serve cocalc-lite on port 30000, AND
- also at the same time be a compute server (id=1) for the cocalc instance running at port 9001,
  identified as the project that sk-p2P7iMlc5sJ4pbQ9000005 gives access to.

*/

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
import { initHttpServer, initApp } from "./http";
import { localPathFileserver } from "@cocalc/backend/conat/files/local-path";
import { init as initBugCounter } from "@cocalc/project/bug-counter";
import { init as initChangefeeds } from "./hub/changefeeds";
import { init as initHubApi } from "./hub/api";
import { account_id } from "@cocalc/backend/data";
import { init as initRemote } from "./remote";
import { getAuthToken } from "./auth-token";
import getLogger from "@cocalc/backend/logger";
import compression from "compression";

const logger = getLogger("lite:main");

export let conatServer: ConatServer | null = null;
export let persistServer: any = null;

function conat(opts?): Client {
  if (conatServer == null) {
    throw Error("not initialized");
  }
  return conatServer.client({ path: "/", ...opts });
}

export async function main(): Promise<number> {
  logger.debug("main");
  process.chdir(process.env.HOME ?? "");
  initBugCounter();

  const AUTH_TOKEN = await getAuthToken();

  logger.debug("start http server");
  const { httpServer, app, port, isHttps } = await initHttpServer({
    AUTH_TOKEN,
  });

  logger.debug("create server");
  const options = {
    httpServer,
    ssl: isHttps,
    port,
    getUser: async () => {
      return { account_id };
    },
  };
  conatServer = createConatServer(options);
  if (conatServer.state != "ready") {
    await once(conatServer, "ready");
  }
  logger.debug("conat address: ", conatServer.address());
  setConatServer(conatServer.address());

  // CRITICAL: keep this *AFTER* the websocket Conat stuff or anything you do not
  // want to have compressed to avoid massive performance problems.
  // suggested by http://expressjs.com/en/advanced/best-practice-performance.html#use-gzip-compression
  app.use(compression());

  logger.debug("create client");
  const conatClient = conat();
  setConatClient({ conat, getLogger });

  logger.debug("init app");
  initApp({ app, conatClient, AUTH_TOKEN, isHttps });

  logger.debug("create persist server");
  persistServer = createPersistServer({ client: conatClient });

  logger.debug("start project services");
  cleanup();
  startProjectServices({ client: conatClient });

  logger.debug("start changefeed server");
  initChangefeeds({ client: conatClient });

  const path = process.cwd();

  logger.debug("start hub api");
  await initHubApi({ client: conatClient });

  logger.debug("start fs service");
  localPathFileserver({
    client: conatClient,
    path,
    project_id,
    unsafeMode: true,
  });

  logger.debug("start remote connection (if enabled)");
  // TODO: I think initRemote messes up the default conat
  // client thus we have to run it last right now.
  await initRemote({ httpServer, path });

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
