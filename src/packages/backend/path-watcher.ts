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
enough, unless the directory has a bazillion files.

We assume path is relative to HOME or is absolute.

NOTE: We always use polling so that network file systems like NFS just work by default.
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
      this.log("watch", { directories: [this.path] });
      w.watch({ directories: [this.path] });
    } else {
      this.log("watch", { missing: [this.path] });
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
