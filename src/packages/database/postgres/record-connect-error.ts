/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import getLogger from "@cocalc/backend/logger";
import { newCounter } from "../metrics";
const countErrors = newCounter(
  "db_connect_errors_total",
  "Number of database connection errors"
);

const L = getLogger("db:record-connect-error");

// max number of error timestamp to keep in memory
const MAX_ERRORS = 10;

// timestamps
const recentErrors: number[] = [];

export function recoord() {
  L.debug("recording connect error to database");
  countErrors.inc();
  recentErrors.push(Date.now());
  while (recentErrors.length > MAX_ERRORS) {
    recentErrors.shift();
  }
}

export function numRecentErrors(since_s: number): number {
  // return how many entries are in recentErrors,
  // which are newer than since_s seconds ago
  const since = Date.now() - since_s * 1000;
  return recentErrors.filter((d) => d > since).length;
}
