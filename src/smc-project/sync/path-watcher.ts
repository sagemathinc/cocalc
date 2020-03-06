/*
Slightly generalized fs.watch that works even when the directory doesn't exist,
but also doesn't provide any information about what changed.

NOTE: We could maintain the directory listing and just try to update info about the filename,
taking into account the type.  That's probably really hard to get right, and just
debouncing and computing the whole listing is going to be vastly easier and good
enough at least for first round of this.
*/

import { watch, FSWatcher } from "fs";
import { join } from "path";
import { EventEmitter } from "events";
import { debounce } from "lodash";

export class Watcher extends EventEmitter {
  private path: string;
  private watcher: FSWatcher;
  private debounce_ms: number;

  constructor(path: string, debounce_ms: number) {
    super();
    if (process.env.HOME == null) throw Error("bug -- HOME must be defined");
    this.path = join(process.env.HOME, path);
    this.debounce_ms = debounce_ms;
    this.init();
  }

  private init(): void {
    this.watcher = watch(
      this.path,
      debounce(this.change.bind(this), this.debounce_ms)
    );
  }

  private change(): void {
    this.emit("change");
  }

  public close(): void {
    delete this.path;
    delete this.debounce_ms;
    if (this.watcher != null) {
      this.watcher.close();
    }
    delete this.watcher;
  }
}
