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

We *always* use polling to fully support networked filesystems.

For testing something like this:

a = require('./dist/watcher'); w = new a.Watcher('/projects/3fa218e5-7196-4020-8b30-e2127847cc4f/cocalc/src/packages/backend/x.txt'); w.on('change', console.log); w.on('delete',()=>console.log("delete"))
*/

import { EventEmitter } from "node:events";
import Watchpack from "watchpack";
import { getLogger } from "./logger";
import { stat } from "fs/promises";
import { join } from "path";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { close } from "@cocalc/util/misc";

const logger = getLogger("backend:watcher");

const DEFAULT_POLL_MS = parseInt(
  process.env.COCALC_FS_WATCHER_POLL_INTERVAL_MS ?? "750",
);

export class Watcher extends EventEmitter {
  private path: string;
  private watchContents?: Watchpack;
  private log: Function;

  constructor(path: string, { debounce = 0 }: { debounce?: number } = {}) {
    super();
    this.log = logger.extend(path).debug;
    if (process.env.HOME == null) {
      throw Error("bug -- HOME must be defined");
    }
    this.path = path.startsWith("/") ? path : join(process.env.HOME, path);
    this.log("init file watcher:", { path: this.path });
    this.init({ debounce });
  }

  private init = async ({ debounce }) => {
    const w = new Watchpack({
      followSymlinks: true,
      poll: DEFAULT_POLL_MS,
      aggregateTimeout: debounce,
    });
    this.watchContents = w;
    if (await exists(this.path)) {
      this.log("watch", { files: [this.path] });
      w.watch({ files: [this.path] });
    } else {
      this.log("watch", { missing: [this.path] });
      w.watch({ missing: [this.path] });
    }
    w.on("aggregated", async () => {
      try {
        const stats = await stat(this.path);
        this.emit("change", stats.ctime, stats);
      } catch (_) {
        this.emit("delete");
      }
    });
  };

  public close(): void {
    this.watchContents?.close();
    close(this);
  }
}

