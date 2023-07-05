/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { getLogger } from "./logger";

let bugCount: number = 0;

export function init() {
  const winston = getLogger("BUG (uncaughtException)");
  process.addListener("uncaughtException", (err) => {
    bugCount += 1;
    const border = `BUG (count=${bugCount}) ****************************************************************************`;
    winston.debug(border);
    winston.debug(`Uncaught exception: ${err}`);
    winston.debug(err.stack);
    winston.debug(border);
    console?.trace?.();
  });
}

export default function getBugCount(): number {
  return bugCount;
}

export function bad(n) {
  if (Math.random() < n) {
    console.log("not throwing error");
    return;
  }
  console.log("throwing an error on purpose");
  throw Error("foo");
}
