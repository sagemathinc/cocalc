/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Watch A DIRECTORY for changes.  Use ./watcher.ts for a single file.

Slightly generalized fs.watch that works even when the directory doesn't exist,
but also doesn't provide any information about what changed.

NOTE: We could maintain the directory listing and just try to update info about the filename,
taking into account the type.  That's probably really hard to get right, and just
debouncing and computing the whole listing is going to be vastly easier and good
enough at least for first round of this.

We assume path is relative to HOME and contained inside of HOME.

The code below deals with two very different cases:
 - when that path doesn't exist: use fs.watch on the parent directory.
        NOTE: this case can't happen when path='', which exists, so we can assume to have read perms on parent.
 - when the path does exist: use fs.watch (hence inotify) on the path itself to report when it changes

NOTE: if you are running on a file system like NFS, inotify won't work well or not at all.
In that case, set the env variable COCALC_FS_WATCHER=poll to use polling instead.
You can configure the poll interval by setting COCALC_FS_WATCHER_POLL_INTERVAL_MS.

UPDATE: We are using polling in ALL cases.  We have subtle bugs
with adding and removing directories otherwise, and also
we are only ever watching a relatively small number of directories
with a long interval, so polling is not so bad.
*/

import Watchpack from "watchpack";
import { join } from "path";
import { EventEmitter } from "events";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { close } from "@cocalc/util/misc";
import { getLogger } from "./logger";

const logger = getLogger("backend:path-watcher");

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
    this.log("init path watcher:", { path: this.path });
    this.init({ debounce });
  }

  private init = async ({ debounce }) => {
    const w = new Watchpack({
      followSymlinks: false,
      poll: DEFAULT_POLL_MS,
      aggregateTimeout: debounce,
    });
    this.watchContents = w;
    if (this.path == "" || (await exists(this.path))) {
      console.log("watch", { directories: [this.path] });
      w.watch({ directories: [this.path] });
    } else {
      console.log("watch", { missing: [this.path] });
      w.watch({ missing: [this.path] });
    }
    w.on("aggregated", () => {
      this.emit("change");
    });
  };

  public close(): void {
    this.watchContents?.close();
    close(this);
  }
}
