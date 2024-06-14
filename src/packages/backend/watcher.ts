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

const L = getLogger("backend:watcher");

export class Watcher extends EventEmitter {
  private path: string;
  private interval: number;
  private watcher: FSWatcher;

  constructor(
    path: string,
    interval: number = 300,
    debounce: number = 0,
    opts?,
  ) {
    super();
    this.path = path;
    this.interval = interval;

    L.debug({ path, interval, debounce, opts });
    this.watcher = watch(this.path, {
      interval: this.interval, // only effective if we end up forced to use polling
      persistent: false,
      alwaysStat: true,
      atomic: true,
      ...opts,
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
