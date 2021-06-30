/* Initialize both the hub and browser servers. */

import initPidFile from "smc-project/pid-file";
import { getLogger } from "smc-project/logger";

const winston = getLogger("init-project-server");

export default async function init() {
  winston.info("Write pid file to disk.");
  await initPidFile();

  
}
