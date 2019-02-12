/*
 * decaffeinate suggestions:
 * DS001: Remove Babel/TypeScript constructor workaround
 * DS101: Remove unnecessary use of Array.from
 * DS102: Remove unnecessary code created because of implicit returns
 * DS103: Rewrite code to no longer use __guard__
 * DS207: Consider shorter variations of null checks
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/master/docs/suggestions.md
 */

const { webapp_client } = require("../webapp_client");

const misc = require("smc-util/misc");

const { callback2, once } = require("smc-util/async-utils");

import { Actions } from "../app-framework";

const immutable = require("immutable");

export class FileUseActions extends Actions {
  constructor(...args) {
    super(...args);
    this._init = this._init.bind(this);
    this.record_error = this.record_error.bind(this);
    this.mark_all = this.mark_all.bind(this);
    this.mark_file = this.mark_file.bind(this);
  }

  _init() {
    const store = this.redux.getStore("file_use");
    return store.on("change", () => {
      // Ensure derived immutable state is updated right after clearing the cache; this of course
      // initializes the cache.
      return this.setState({ notify_count: store.get_notify_count() });
    });
  }

  record_error(err) {
    // Record in the store that an error occured as a result of some action
    // This should get displayed to the user...
    if (!typeof err === "string") {
      err = misc.to_json(err);
    }
    return this.setState({
      errors: this.redux
        .getStore("file_use")
        .get_errors()
        .push(immutable.Map({ time: webapp_client.server_time(), err }))
    });
  }

  // OPTIMIZATION: This updates and rerenders for each item. Change to doing it in a batch.
  mark_all(action) {
    let v;
    if (action === "read") {
      v = this.redux.getStore("file_use").get_all_unread();
    } else if (action === "seen") {
      v = this.redux.getStore("file_use").get_all_unseen();
    } else {
      this.record_error(`mark_all: unknown action '${action}'`);
      return;
    }
    return Array.from(v).map(x =>
      this.mark_file(x.project_id, x.path, action, 0, false)
    );
  }

  _set = async obj => {
    try {
      if (!webapp_client.is_signed_in()) {
        await once(webapp_client, "signed_in");
      }
      return await callback2(webapp_client.query, { query: { file_use: obj } });
    } catch (error) {
      const err = error;
      return console.warn("WARNING: mark_file error -- ", err);
    }
  };

  // Mark the action for the given file with the current timestamp (right now).
  // If zero is true, instead mark the timestamp as 0, basically indicating removal
  // of that marking for that user.
  mark_file(project_id, path, action, ttl, fix_path, timestamp) {
    // ttl in units of ms
    if (ttl == null) {
      ttl = "default";
    }
    if (fix_path == null) {
      fix_path = true;
    }
    if (timestamp == null) {
      timestamp = undefined;
    }
    if (fix_path) {
      // This changes .foo.txt.sage-chat to foo.txt.
      path = misc.original_path(path);
    }
    //console.log('mark_file', project_id, path, action)
    const account_id = this.redux.getStore("account").get_account_id();
    if (account_id == null) {
      // nothing to do -- non-logged in users shouldn't be marking files
      return;
    }
    const project_is_known = __guard__(
      this.redux.getStore("projects").get("project_map"),
      x => x.has(project_id)
    );
    if (!project_is_known) {
      // user is not currently a collaborator on this project, so definitely shouldn't
      // mark file use.
      return;
    }
    if (ttl) {
      if (ttl === "default") {
        if (action.slice(0, 4) === "chat") {
          ttl = 5 * 1000;
        } else {
          ttl = 90 * 1000;
        }
      }
      //console.log('ttl', ttl)
      const key = `${project_id}-${path}-${action}`;
      if (this._mark_file_lock == null) {
        this._mark_file_lock = {};
      }
      if (this._mark_file_lock[key]) {
        return;
      }
      this._mark_file_lock[key] = true;
      setTimeout(() => delete this._mark_file_lock[key], ttl);
    }

    const table = this.redux.getTable("file_use");
    if (timestamp == null) {
      timestamp = webapp_client.server_time();
    }
    timestamp = new Date(timestamp);
    const obj = {
      id: sha1(project_id, path),
      project_id,
      path,
      users: { [account_id]: { [action]: timestamp } }
    };
    if (action === "edit" || action === "chat" || action === "chatseen") {
      // Update the overall "last_edited" field for the file; this is used for sorting,
      // and grabbing only recent files from database for file use notifications.
      obj.last_edited = timestamp;
    }
    return this._set(obj);
  }
}

function __guard__(value, transform) {
  return typeof value !== "undefined" && value !== null
    ? transform(value)
    : undefined;
}
