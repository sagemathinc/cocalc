/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* Initialize both tthe conat server (and also pid file) */

import initPidFile from "./pid-file";
import initConat from "@cocalc/project/conat";
import { startProxyServer } from "./proxy/proxy";

import { getLogger } from "@cocalc/project/logger";
const logger = getLogger("servers:init");

export default async function init() {
  logger.debug("servers: init");
  logger.debug("Write pid file to disk.");
  await initPidFile();
  logger.debug("Start Conat services");
  await initConat();
  logger.debug("Start proxy server");
  startProxyServer();
}
