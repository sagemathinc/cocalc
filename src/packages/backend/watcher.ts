/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Watch one SINGLE FILE for changes.   Use ./path-watcher.ts for a directory.

Watch for changes to the given file.  Returns obj, which
is an event emitter with events:

   - 'change', ctime, stats - when file changes or is created
   - 'delete' - when file is deleted

and a method .close().

Only fires after the file definitely has not had its
ctime changed for at least debounce ms (this is the atomic
option to chokidar).  Does NOT fire when the file first
has ctime changed.
*/

import { EventEmitter } from "node:events";
import { watch, FSWatcher } from "chokidar";
import { getLogger } from "./logger";
import { debounce as lodashDebounce } from "lodash";

const logger = getLogger("backend:watcher");

export class Watcher extends EventEmitter {
  private path: string;
  private watcher: FSWatcher;

  constructor(
    path: string,
    { debounce, interval = 300 }: { debounce?: number; interval?: number } = {},
  ) {
    super();
    this.path = path;

    logger.debug({ path, debounce, interval });
    this.watcher = watch(this.path, {
      interval,
      // polling is critical for network mounted file systems,
      // and given architecture of cocalc there is no easy way around this.
      // E.g., on compute servers, everything breaks involving sync or cloudfs,
      // and in shared project s3/gcsfuse/sshfs would all break. So we
      // use polling.
      usePolling: true,
      persistent: true,
      alwaysStat: true,
    });
    this.watcher.on("unlink", () => {
      this.emit("delete");
    });
    this.watcher.on("unlinkDir", () => {
      this.emit("delete");
    });

    const f = (ctime, stats) => {
      logger.debug("change", this.path, ctime);
      this.emit("change", ctime, stats);
    };
    const emitChange = debounce ? lodashDebounce(f, debounce) : f;

    this.watcher.on("error", (err) => {
      logger.debug("WATCHER error -- ", err);
    });

    this.watcher.on("change", (_, stats) => {
      if (stats == null) {
        logger.debug("WATCHER change with no stats (shouldn't happen)", {
          path,
        });
        return;
      }
      emitChange(stats.ctime, stats);
    });
  }

  close = async () => {
    logger.debug("close", this.path);
    this.removeAllListeners();
    await this.watcher.close();
  };
}
