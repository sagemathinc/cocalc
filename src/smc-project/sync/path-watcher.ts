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
*/

import { watch, FSWatcher } from "fs";
import { join } from "path";
import { EventEmitter } from "events";
import { debounce } from "lodash";
import { exists } from "../jupyter/async-utils-node";
import { close, path_split } from "../smc-util/misc";

export class Watcher extends EventEmitter {
  private path: string;
  private exists: boolean;
  private watch_contents?: FSWatcher;
  private watch_existence?: FSWatcher;
  private debounce_ms: number;
  private log: Function;

  constructor(path: string, debounce_ms: number, log: Function) {
    super();
    this.debounce_ms = debounce_ms;
    this.log = log;
    this.log(`Watcher("${path}")`);
    if (process.env.HOME == null) throw Error("bug -- HOME must be defined");
    this.path = join(process.env.HOME, path);
    this.init();
  }

  private async init(): Promise<void> {
    this.exists = await exists(this.path);
    if (this.path != "") {
      this.init_watch_existence();
    }
    if (this.exists) {
      this.init_watch_contents();
    }
  }

  private init_watch_contents(): void {
    this.watch_contents = watch(
      this.path,
      debounce(this.change.bind(this), this.debounce_ms, {
        leading: true,
        trailing: true,
      })
    );
  }

  private async init_watch_existence(): Promise<void> {
    const containing_path = path_split(this.path).head;
    this.watch_existence = watch(containing_path, async (_, filename) => {
      const path = join(containing_path, filename);
      if (path != this.path) return;
      const e = await exists(this.path);
      if (!this.exists && e) {
        // it sprung into existence
        this.exists = e;
        this.init_watch_contents();
        this.change();
      } else if (this.exists && !e) {
        // it got deleted
        this.exists = e;
        if (this.watch_contents != null) {
          this.watch_contents.close();
          delete this.watch_contents;
        }
        this.change();
      }
    });
  }

  private change(): void {
    this.emit("change");
  }

  public close(): void {
    if (this.watch_contents != null) {
      this.watch_contents.close();
    }
    if (this.watch_existence != null) {
      this.watch_existence.close();
    }
    close(this);
  }
}
