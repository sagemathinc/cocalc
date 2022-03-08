/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { writeFile } from "fs";
import { callback } from "awaiting";

import {
  projectPidFile,
  startTimestampFile,
  sessionIDFile,
} from "@cocalc/project/data";
import { session_id, start_ts } from "@cocalc/project/consts";

export default async function init() {
  await Promise.all([
    callback(writeFile, projectPidFile, `${process.pid}`),
    callback(writeFile, startTimestampFile, `${start_ts}`),
    callback(writeFile, sessionIDFile, `${session_id}`),
  ]);
}
