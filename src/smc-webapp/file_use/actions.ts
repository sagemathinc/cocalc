import { Actions, redux } from "../app-framework";
import * as immutable from "immutable";
const misc = require("smc-util/misc");
const sha1 = require("smc-util/schema").client_db.sha1;
import { FileUseState } from "./store";
const { webapp_client } = require("../webapp_client");





export class FileUseActions extends Actions<FileUseState> {
  private _mark_file_lock: any;
  _init = () => {
    const store = redux.getStore("file_use");
    return store.on("change", () => {
      // Ensure derived immutable state is updated right after clearing the cache; this of course
      // initializes the cache.
      return this.setState({ notify_count: store.get_notify_count() });
    });
  };

  record_error = (err: any) => {
    // Record in the store that an error occured as a result of some action
    // This should get displayed to the user...
    if (typeof err !== "string") {
      err = misc.to_json(err);
    }
    this.setState({
      errors: this.redux
        .getStore("file_use")
        .get_errors()
        .push(immutable.Map({ time: webapp_client.server_time(), err }))
    });
  };

  // OPTIMIZATION: This updates and rerenders for each item. Change to doing it in a batch.
  mark_all = (action: "read" | "seen") => {
    let v: any;
    if (action === "read") {
      v = this.redux.getStore("file_use").get_all_unread();
    } else if (action === "seen") {
      v = this.redux.getStore("file_use").get_all_unseen();
    } else {
      this.record_error(`mark_all: unknown action '${action}'`);
      return;
    }
    return v.map(x => this.mark_file(x.project_id, x.path, action, 0, false));
  };

  // Mark the action for the given file with the current timestamp (right now).
  // If zero is true, instead mark the timestamp as 0, basically indicating removal
  // of that marking for that user.
  // TODO: what are possible options for "action"
  mark_file = (
    project_id: string,
    path: string,
    action: string,
    ttl = "default" as "default" | number,
    fix_path = true,
    timestamp?: string | Date
  ) => {
    // ttl in units of ms
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
    const project_map = this.redux.getStore("projects").get("project_map");
    const project_is_known = project_map != null && project_map.has(project_id);
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
    timestamp = new Date(timestamp!);
    const obj: any = {
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
    table.set(obj);
  };
}
