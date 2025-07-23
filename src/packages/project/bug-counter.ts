/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { getLogger } from "./logger";

let bugCount: number = 0;

const STARS =
  "\nBUG ****************************************************************************\n";

export function init() {
  const log = getLogger("BUG (uncaughtException)");
  getLogger("handler").debug("initializing uncaughtException handler");

  process.on("uncaughtExceptionMonitor", (err, origin) => {
    // sometimes we only get one output and then process terminates, despite the uncaughtException,
    // so we make the best of it:
    log.error(STARS, err, origin, err.stack);
  });

  const f = (err) => {
    bugCount += 1;
    const border = `BUG (count=${bugCount}) ${STARS}`;
    log.error(border);
    log.error(`Uncaught exception: ${err}`);
    console.warn(err);
    log.error(err.stack);
    log.error(border);
  };
  process.on("uncaughtException", f);
  process.on("unhandledRejection", f);
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
