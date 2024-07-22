/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { writeFile } from "node:fs/promises";
import { session_id, start_ts } from "@cocalc/project/consts";
import {
  projectPidFile,
  sessionIDFile,
  startTimestampFile,
} from "@cocalc/project/data";
import { pidUpdateIntervalMs } from "@cocalc/util/project-info";
import { getLogger } from "@cocalc/project/logger";

const logger = getLogger("pid-file");

export default async function init() {
  logger.debug("init -- writing out initial pid file info");
  await Promise.all([
    writeFile(projectPidFile, `${process.pid}`),
    writeFile(startTimestampFile, `${start_ts}`),
    writeFile(sessionIDFile, `${session_id}`),
  ]);

  // we also write the pid file out periodically so that the server
  // knows *this* particular project is really alive and working.
  setInterval(async () => {
    try {
      logger.debug("updating ", projectPidFile);
      await writeFile(projectPidFile, `${process.pid}`);
    } catch (err) {
      // this will likely result in the server killing the project...
      logger.debug("ERROR updating ", projectPidFile, err);
    }
  }, pidUpdateIntervalMs);
}
