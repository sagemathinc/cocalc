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

The ctime might be undefined, in case it can't be determined.

If debounce is given, only fires after the file
definitely has not had its ctime changed
for at least debounce ms.  Does NOT fire when
the file first has ctime changed.
*/

import { EventEmitter } from "node:events";
import { stat, unwatchFile, watchFile } from "node:fs";
import { getLogger } from "./logger";

const L = getLogger("watcher");

export class Watcher extends EventEmitter {
  private path: string;
  private interval: number;
  private debounce: number;
  private _waiting_for_stable?: boolean;

  constructor(path, interval, debounce) {
    super();
    this.close = this.close.bind(this);
    this._listen = this._listen.bind(this);
    this._emit_when_stable = this._emit_when_stable.bind(this);
    this.path = path;
    this.interval = interval;
    this.debounce = debounce;

    L.debug(`${path}: interval=${interval}, debounce=${debounce}`);
    watchFile(
      this.path,
      { interval: this.interval, persistent: false },
      this._listen
    );
  }

  close() {
    this.removeAllListeners();
    unwatchFile(this.path, this._listen);
  }

  _listen(curr, _prev): void {
    if (curr.dev === 0) {
      this.emit("delete");
      return;
    }
    if (this.debounce) {
      this._emit_when_stable(true);
    } else {
      stat(this.path, (err, stats) => {
        if (!err) {
          this.emit("change", stats.ctime);
        }
      });
    }
  }

  _emit_when_stable(first): void {
    /*
    @_emit_when_stable gets called
    periodically until the last ctime of the file
    is at least @debounce ms in the past, or there
    is an error.
    */
    if (first && this._waiting_for_stable) {
      return;
    }
    this._waiting_for_stable = true;
    stat(this.path, (err, stats) => {
      if (err) {
        // maybe file deleted; give up.
        delete this._waiting_for_stable;
        return;
      }
      const elapsed = Date.now() - stats.ctime.getTime();
      if (elapsed < this.debounce) {
        // File keeps changing - try again soon
        setTimeout(
          () => this._emit_when_stable(false),
          Math.max(500, this.debounce - elapsed + 100)
        );
      } else {
        delete this._waiting_for_stable;
        this.emit("change", stats.ctime);
      }
    });
  }
}
