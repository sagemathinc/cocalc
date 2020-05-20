/*
 * This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 * License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// https://github.com/airbnb/node-memwatch#readme
import * as memwatch from "@airbnb/node-memwatch";

export function init(log) {
  memwatch.on("leak", (info) => log(`MEMWATCH_LEAK='${JSON.stringify(info)}'`));
  memwatch.on("stats", (stats) =>
    log(`MEMWATCH_STATS='${JSON.stringify(stats)}'`)
  );
}
