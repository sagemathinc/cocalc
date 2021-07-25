/* Initialize both the hub and browser servers. */

import { getLogger } from "smc-project/logger";
import initPidFile from "./pid-file";
import initSecretToken from "./secret-token";
import initAPIServer from "smc-project/http-api/server";
import initBrowserServer from "./browser/http-server";
import initHubServer from "./hub/tcp-server";

const winston = getLogger("init-project-server");

export default async function init() {
  winston.info("Write pid file to disk.");
  await initPidFile();
  await initSecretToken(); // must be before servers, since they use this.
  await initAPIServer();
  await initBrowserServer();
  await initHubServer();
}
