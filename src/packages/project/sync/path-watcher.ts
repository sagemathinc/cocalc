/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
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

NOTE: if you are running on a filesystem like NFS, inotify won't work well or not at all.
In that case, set the env variable COCALC_FS_WATCHER=poll to use fs.watchFile instead.
*/

import { watch, WatchOptions } from "chokidar";
import { FSWatcher } from "fs";
import { join } from "path";
import { EventEmitter } from "events";
import { debounce } from "lodash";
import { exists } from "../jupyter/async-utils-node";
import { close, path_split } from "@cocalc/util/misc";
import { getLogger } from "@cocalc/project/logger";
const L = getLogger("fs-watcher");

const COCALC_FS_WATCHER = process.env.COCALC_FS_WATCHER ?? "inotify";
if (!["inotify", "poll"].includes(COCALC_FS_WATCHER)) {
  throw new Error(
    `$COCALC_FS_WATCHER=${COCALC_FS_WATCHER} -- must be "inotify" or "poll"`
  );
}
const POLLING = COCALC_FS_WATCHER === "poll";

const DEFAULT_POLL_MS = parseInt(
  process.env.COCALC_FS_WATCHER_POLL_INTERVAL_MS ?? "2000"
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
} as const;

export class Watcher extends EventEmitter {
  private path: string;
  private exists: boolean;
  private watchContents?: FSWatcher;
  private watchExistence?: FSWatcher;
  private debounce_ms: number;
  private debouncedChange: any;
  private log: Function;

  constructor(path: string, debounce_ms: number) {
    super();
    this.log = L.extend(path).debug;
    this.log(`initalizing: poll=${POLLING}`);
    if (process.env.HOME == null) throw Error("bug -- HOME must be defined");
    this.path = join(process.env.HOME, path);
    this.debounce_ms = debounce_ms;
    this.debouncedChange = debounce(this.change.bind(this), this.debounce_ms, {
      leading: true,
      trailing: true,
    }).bind(this);
    this.init();
  }

  private async init(): Promise<void> {
    this.exists = await exists(this.path);
    if (this.path != "") {
      this.initWatchExistence();
    }
    if (this.exists) {
      this.initWatchContents();
    }
  }

  private initWatchContents(): void {
    this.watchContents = watch(this.path, ChokidarOpts);
    this.watchContents.on("all", this.debouncedChange);
  }

  private async initWatchExistence(): Promise<void> {
    const containing_path = path_split(this.path).head;
    this.watchExistence = watch(containing_path, ChokidarOpts);
    this.watchExistence.on("all", this.watchExistenceChange(containing_path));
  }

  private watchExistenceChange = (containing_path) => async (_, filename) => {
    const path = join(containing_path, filename);
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
      for (const w in ["watchContentsInotify", "watchContentsPoll"]) {
        if (this[w] != null) {
          this[w].close();
          delete this[w];
        }
      }

      this.change();
    }
  };

  private change(): void {
    this.emit("change");
  }

  public close(): void {
    this.watchExistence?.close();
    this.watchContents?.close();
    close(this);
  }
}
