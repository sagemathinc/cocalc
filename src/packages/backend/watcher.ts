/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Watch one SINGLE FILE for changes.   Use ./path-watcher.ts for a directory.

Watch for changes to the given file, which means the ctime or mode changes (atime is ignored).  
Returns obj, which is an event emitter with events:

   - 'change', ctime, stats - when file changes or is created
   - 'delete' - when file is deleted

and a method .close().

Only fires after the file definitely has not had its
ctime changed for at least debounce ms.  Does NOT
fire when the file first has ctime changed.

NOTE: for directories we use chokidar in path-watcher.  However,
for a single file using polling, chokidar is horribly buggy and
lacking in functionality (e.g., https://github.com/paulmillr/chokidar/issues/1132),
and declared all bugs fixed, so we steer clear.  It had a lot of issues
with just noticing actual file changes.

I tried using node:fs's built-in watchFile and it randomly stopped working.
Very weird.   I think this might have something to do with file paths versus inodes.

I ended up just writing a file watcher using polling from scratch.

We *always* use polling to fully support networked filesystems.
We use exponential backoff though which doesn't seem to be in any other
polling implementation, but reduces load and make sense for our use case.
*/

import { EventEmitter } from "node:events";
import { getLogger } from "./logger";
import { debounce as lodashDebounce } from "lodash";
import { stat } from "fs/promises";

const logger = getLogger("backend:watcher");

// exponential backoff to reduce load for inactive files
const BACKOFF = 1.2;
const MIN_INTERVAL_MS = 750;
const MAX_INTERVAL_MS = 5000;

export class Watcher extends EventEmitter {
  private path?: string;
  private prev: any = undefined;
  private interval: number;
  private minInterval: number;
  private maxInterval: number;

  constructor(
    path: string,
    {
      debounce,
      interval = MIN_INTERVAL_MS,
      maxInterval = MAX_INTERVAL_MS,
    }: { debounce?: number; interval?: number; maxInterval?: number } = {},
  ) {
    super();
    if (debounce) {
      this.emitChange = lodashDebounce(this.emitChange, debounce);
    }
    logger.debug("Watcher", { path, debounce, interval, maxInterval });
    this.path = path;
    this.minInterval = interval;
    this.maxInterval = maxInterval;
    this.interval = interval;
    this.init();
  }

  private init = async () => {
    if (this.path == null) {
      // closed
      return;
    }
    // first time, so initialize it
    try {
      this.prev = await stat(this.path);
    } catch (_) {
      // doesn't exist
      this.prev = null;
    }
    setTimeout(this.update, this.interval);
  };

  private update = async () => {
    if (this.path == null) {
      // closed
      return;
    }
    try {
      const prev = this.prev;
      const curr = await stat(this.path);
      if (
        curr.ctimeMs != prev?.ctimeMs ||
        curr.mtimeMs != prev?.mtimeMs ||
        curr.mode != prev?.mode
      ) {
        this.prev = curr;
        this.interval = this.minInterval;
        this.emitChange(curr);
      }
    } catch (_err) {
      if (this.prev != null) {
        this.interval = this.minInterval;
        this.prev = null;
        logger.debug("delete", this.path);
        this.emit("delete");
      }
    } finally {
      setTimeout(this.update, this.interval);
      this.interval = Math.min(this.maxInterval, this.interval * BACKOFF);
    }
  };

  private emitChange = (stats) => {
    logger.debug("change", this.path);
    this.emit("change", stats.ctime, stats);
  };

  close = () => {
    logger.debug("close", this.path);
    this.removeAllListeners();
    delete this.path;
  };
}
