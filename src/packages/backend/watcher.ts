/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Watch one SINGLE FILE for changes.   Use ./path-watcher.ts for a directory.

Watch for changes to the given file, which means the mtime changes or the
mode changes (e.g., readonly versus readwrite).  Returns obj, which
is an event emitter with events:

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

We *always* use polling to fully support networked filesystems.
*/

import { EventEmitter } from "node:events";
import { unwatchFile, watchFile } from "node:fs";
import { getLogger } from "./logger";
import { debounce as lodashDebounce } from "lodash";

const logger = getLogger("backend:watcher");

export class Watcher extends EventEmitter {
  private path: string;

  constructor(
    path: string,
    { debounce, interval = 300 }: { debounce?: number; interval?: number } = {},
  ) {
    super();
    this.path = path;

    logger.debug("watchFile", { path, debounce, interval });
    watchFile(this.path, { persistent: false, interval }, this.handleChange);

    if (debounce) {
      this.emitChange = lodashDebounce(this.emitChange, debounce);
    }
  }

  private emitChange = (stats) => {
    this.emit("change", stats.ctime, stats);
  };

  private handleChange = (curr, prev) => {
    if (!curr.dev) {
      this.emit("delete");
      return;
    }
    if (curr.mtimeMs == prev.mtimeMs && curr.mode == prev.mode) {
      // just *accessing* triggers watchFile (really StatWatcher), of course.
      return;
    }
    this.emitChange(curr);
  };

  close = () => {
    logger.debug("close", this.path);
    this.removeAllListeners();
    unwatchFile(this.path, this.handleChange);
  };
}
