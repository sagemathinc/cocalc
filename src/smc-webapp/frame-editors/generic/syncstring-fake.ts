/* 
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Used to make code cleaner without having to have lots of cases
// depending on whether syncstring is defined or undefined.
import { EventEmitter } from "events";

import { Map } from "immutable";

import { delay } from "awaiting";

export class FakeSyncstring extends EventEmitter {
  _string_id: string = "";

  constructor() {
    super();
    this.init();
  }

  async init() {
    await delay(0); // wait, so 'ready' event can be listened to.
    this.emit("ready");
  }

  close() {}

  from_str() {}

  to_str() {}

  exit_undo_mode() {}

  in_undo_mode() {}

  undo() {}

  redo() {}

  is_read_only(): boolean {
    return false;
  }

  get_state(): string {
    return "ready";
  }

  has_uncommitted_changes(): boolean {
    return false;
  }
  has_unsaved_changes(): boolean {
    return false;
  }

  hash_of_saved_version(): number {
    return 0;
  }

  save_to_disk(cb): void {
    if (cb) {
      cb();
    }
  }

  save(cb) {
    if (cb) {
      cb();
    }
  }

  _save(cb) {
    if (cb) {
      cb();
    }
  }

  get_settings(): Map<string, any> {
    return Map();
  }

  set_settings(_: object): void {}
}
