/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/* Initialize both tthe conat server (and also pid file) */

import initPidFile from "./pid-file";
import initConat from "@cocalc/project/conat";

import { getLogger } from "@cocalc/project/logger";
const logger = getLogger("init-project-server");

export default async function init() {
  logger.info("Write pid file to disk.");
  await initPidFile();
  await initConat();
}
