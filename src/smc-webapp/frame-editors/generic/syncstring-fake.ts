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
    await delay(0); // wait, so init can be listened to.
    this.emit("init");
  }

  close() {}

  from_str() {}

  to_str() {}

  exit_undo_mode() {}

  in_undo_mode() {}

  undo() {}

  redo() {}

  get_read_only() {
    return false;
  }
  has_uncommitted_changes() {
    return false;
  }
  has_unsaved_changes() {
    return false;
  }

  hash_of_saved_version() {
    return 0;
  }

  save_to_disk(cb) {
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
