/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Watch a file for changes

Watch for changes to the given file.  Returns obj, which
is an event emitter with events:

   - 'change', ctime - when file changes or is created
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

const L = getLogger("watcher");

export class Watcher extends EventEmitter {
  private path: string;
  private interval: number;
  private watcher: FSWatcher;

  constructor(path: string, interval: number = 300, debounce: number = 0) {
    super();
    this.path = path;
    this.interval = interval;

    L.debug(`${path}: interval=${interval}, debounce=${debounce}`);
    this.watcher = watch(this.path, {
      interval: this.interval,
      // polling is critical for network mounted file systems,
      // and given architecture of cocalc there is no easy way around this.
      // E.g., on compute servers, everything breaks involving sync or cloudfs,
      // and in shared project s3/gcsfuse/sshfs would all break. So we
      // use polling.
      usePolling: true,
      persistent: false,
      alwaysStat: true,
      atomic: true,
    });
    this.watcher.on("unlink", () => {
      this.emit("delete");
    });
    this.watcher.on("unlinkDir", () => {
      this.emit("delete");
    });

    const emitChange = lodashDebounce(
      (ctime) => this.emit("change", ctime),
      debounce,
    );
    this.watcher.on("error", (err) => {
      L.debug("WATCHER error -- ", err);
    });

    this.watcher.on("change", (_, stats) => {
      if (stats == null) {
        L.debug("WATCHER change with no stats (shouldn't happen)", { path });
        return;
      }
      emitChange(stats.ctime);
    });
  }

  close = async () => {
    this.removeAllListeners();
    await this.watcher.close();
  };
}
