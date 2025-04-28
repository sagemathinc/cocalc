/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Watch A DIRECTORY for changes of the files in *that* directory only (not recursive).
Use ./watcher.ts for a single file.

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

import { watch, WatchOptions } from "chokidar";
import { FSWatcher } from "fs";
import { join } from "path";
import { EventEmitter } from "events";
import { debounce } from "lodash";
import { exists } from "@cocalc/backend/misc/async-utils-node";
import { close, path_split } from "@cocalc/util/misc";
import { getLogger } from "./logger";

const logger = getLogger("backend:path-watcher");

// const COCALC_FS_WATCHER = process.env.COCALC_FS_WATCHER ?? "inotify";
// if (!["inotify", "poll"].includes(COCALC_FS_WATCHER)) {
//   throw new Error(
//     `$COCALC_FS_WATCHER=${COCALC_FS_WATCHER} -- must be "inotify" or "poll"`,
//   );
// }
// const POLLING = COCALC_FS_WATCHER === "poll";

const POLLING = true;

const DEFAULT_POLL_MS = parseInt(
  process.env.COCALC_FS_WATCHER_POLL_INTERVAL_MS ?? "2000",
);

const ChokidarOpts: WatchOptions = {
  persistent: true, // otherwise won't work
  followSymlinks: false, // don't wander about
  disableGlobbing: true, // watch the path as it is, that's it
  usePolling: POLLING,
  interval: DEFAULT_POLL_MS,
  binaryInterval: DEFAULT_POLL_MS,
  depth: 0, // we only care about the explicitly mentioned path – there could be a lot of files and sub-dirs!
  // maybe some day we want this:
  // awaitWriteFinish: {
  //   stabilityThreshold: 100,
  //   pollInterval: 50,
  // },
  ignorePermissionErrors: true,
  alwaysStat: false,
} as const;

export class Watcher extends EventEmitter {
  private path: string;
  private exists: boolean;
  private watchContents?: FSWatcher;
  private watchExistence?: FSWatcher;
  private debounce_ms: number;
  private debouncedChange: any;
  private log: Function;

  constructor(
    path: string,
    { debounce: debounce_ms = DEFAULT_POLL_MS }: { debounce?: number } = {},
  ) {
    super();
    this.log = logger.extend(path).debug;
    this.log(`initializing: poll=${POLLING}`);
    if (process.env.HOME == null) {
      throw Error("bug -- HOME must be defined");
    }
    this.path = path.startsWith("/") ? path : join(process.env.HOME, path);
    this.debounce_ms = debounce_ms;
    this.debouncedChange = this.debounce_ms
      ? debounce(this.change, this.debounce_ms, {
          leading: true,
          trailing: true,
        }).bind(this)
      : this.change;
    this.init();
  }

  private async init(): Promise<void> {
    this.log("init watching", this.path);
    this.exists = await exists(this.path);
    if (this.path != "") {
      this.log("init watching", this.path, " for existence");
      this.initWatchExistence();
    }
    if (this.exists) {
      this.log("init watching", this.path, " contents");
      this.initWatchContents();
    }
  }

  private initWatchContents(): void {
    this.watchContents = watch(this.path, ChokidarOpts);
    this.watchContents.on("all", this.debouncedChange);
    this.watchContents.on("error", (err) => {
      this.log(`error watching listings -- ${err}`);
    });
  }

  private async initWatchExistence(): Promise<void> {
    const containing_path = path_split(this.path).head;
    this.watchExistence = watch(containing_path, ChokidarOpts);
    this.watchExistence.on("all", this.watchExistenceChange);
    this.watchExistence.on("error", (err) => {
      this.log(`error watching for existence of ${this.path} -- ${err}`);
    });
  }

  private watchExistenceChange = async (_, path) => {
    if (path != this.path) return;
    const e = await exists(this.path);
    if (!this.exists && e) {
      // it sprung into existence
      this.exists = e;
      this.initWatchContents();
      this.change();
    } else if (this.exists && !e) {
      // it got deleted
      this.exists = e;
      if (this.watchContents != null) {
        this.watchContents.close();
        delete this.watchContents;
      }

      this.change();
    }
  };

  private change = (): void => {
    this.emit("change");
  };

  public close(): void {
    this.watchExistence?.close();
    this.watchContents?.close();
    close(this);
  }
}

export class MultipathWatcher extends EventEmitter {
  private paths: { [path: string]: Watcher } = {};
  private options;

  constructor(options?) {
    super();
    this.options = options;
  }

  has = (path: string) => {
    return this.paths[path] != null;
  };

  add = (path: string) => {
    if (this.has(path)) {
      // already watching
      return;
    }
    this.paths[path] = new Watcher(path, this.options);
    this.paths[path].on("change", () => this.emit("change", path));
  };

  delete = (path: string) => {
    if (!this.has(path)) {
      return;
    }
    this.paths[path].close();
    delete this.paths[path];
  };

  close = () => {
    for (const path in this.paths) {
      this.delete(path);
    }
  };
}
