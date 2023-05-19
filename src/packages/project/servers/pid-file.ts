/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { writeFile } from "node:fs/promises";

import { session_id, start_ts } from "@cocalc/project/consts";
import {
  projectPidFile,
  sessionIDFile,
  startTimestampFile,
} from "@cocalc/project/data";

export default async function init() {
  await Promise.all([
    writeFile(projectPidFile, `${process.pid}`),
    writeFile(startTimestampFile, `${start_ts}`),
    writeFile(sessionIDFile, `${session_id}`),
  ]);
}
