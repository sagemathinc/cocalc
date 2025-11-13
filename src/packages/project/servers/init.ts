/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* Initialize both the hub and browser servers. */

import initPidFile from "./pid-file";
import initAPIServer from "@cocalc/project/http-api/server";
import initBrowserServer from "./browser/http-server";
import initHubServer from "./hub/tcp-server";

import { getLogger } from "@cocalc/project/logger";
const winston = getLogger("init-project-server");

export default async function init() {
  winston.info("Write pid file to disk.");
  await initPidFile();
  await initAPIServer();
  await initBrowserServer();
  await initHubServer();
}
