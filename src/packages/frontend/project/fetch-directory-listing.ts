import { is_running_or_starting } from "./project-start-warning";
import type { ProjectActions } from "@cocalc/frontend/project_actions";
import { trunc_middle, is_string, to_json, uuid } from "@cocalc/util/misc";
import { get_directory_listing2 as get_directory_listing } from "./directory-listing";
import * as async from "async";
import { fromJS } from "immutable";

interface FetchDirectoryListingOpts {
  path?: string;
  // WARNING: THINK VERY HARD BEFORE YOU USE force=true, due to efficiency!
  force?: boolean;
  cb?: () => void;
}

const lock: { [key: string]: Function[] } = {};

export default function fetchDirectoryListing(
  actions: ProjectActions,
  { path, force, cb }: FetchDirectoryListingOpts = {},
): void {
  let status;
  let store = actions.get_store();
  if (store == undefined) {
    return;
  }
  if (path == null) {
    path = store.get("current_path");
  }

  if (force && path != null) {
    // always update our interest.
    store.get_listings().watch(path, true);
  }

  // In the vast majority of cases, you just want to look at the data.
  // Very rarely should you need something to execute exactly after actions
  if (path == null) {
    // nothing to do if path isn't defined -- there is no current path -- see https://github.com/sagemathinc/cocalc/issues/818
    return;
  }

  const key = `${actions.project_id}${path}`;
  // actions makes sure cb is being called, even when there are concurrent requests
  if (lock[key] != null) {
    // currently doing it already
    if (cb != null) {
      lock[key].push(cb);
    }
    return;
  }
  lock[key] = [];
  // Wait until user is logged in, project store is loaded enough
  // that we know our relation to actions project, namely so that
  // get_my_group is defined.
  const id = uuid();
  if (path) {
    status = `Loading file list - ${trunc_middle(path, 30)}`;
  } else {
    status = "Loading file list";
  }

  // only show actions indicator, if the project is running or starting
  // if it is stopped, we might get a stale listing from the database!
  if (is_running_or_starting(actions.project_id)) {
    actions.set_activity({ id, status });
  }

  let my_group: any;
  let the_listing: any;
  async.series(
    [
      (cb) => {
        // make sure the user type is known;
        // otherwise, our relationship to project
        // below can't be determined properly.
        actions.redux.getStore("account").wait({
          until: (s) =>
            (s.get("is_logged_in") && s.get("account_id")) ||
            !s.get("is_logged_in"),
          cb: cb,
        });
      },

      (cb) => {
        const projects_store = actions.redux.getStore("projects");
        // make sure that our relationship to actions project is known.
        if (projects_store == null) {
          cb("projects_store not yet initialized");
          return;
        }
        projects_store.wait({
          until: (s) => (s as any).get_my_group(actions.project_id),
          timeout: 30,
          cb: (err, group) => {
            my_group = group;
            cb(err);
          },
        });
      },

      async (cb) => {
        store = actions.get_store();
        if (store == null) {
          cb("store no longer defined");
          return;
        }
        if (path == null) {
          path = store.get("current_path");
        }
        try {
          the_listing = await get_directory_listing({
            project_id: actions.project_id,
            path,
            hidden: true,
            max_time_s: 15 * 60, // keep trying for up to 15 minutes
            group: my_group,
            trigger_start_project: false,
          });
        } catch (err) {
          cb(err.message);
          return;
        }
        cb();
      },
    ],

    (err) => {
      actions.set_activity({ id, stop: "" });
      // Update the path component of the immutable directory listings map:
      store = actions.get_store();
      if (store == undefined) {
        return;
      }
      if (err && !is_string(err)) {
        err = to_json(err);
      }
      if (path == null) throw Error("bug"); // make typescript happy
      if (the_listing != null) {
        const map = store
          .get("directory_listings")
          .set(path, err ? err : fromJS(the_listing.files));
        actions.setState({ directory_listings: map });
      }
      // done! releasing lock, then executing callback(s)
      const cbs = lock[key];
      delete lock[key];
      for (const cb of cbs != null ? cbs : []) {
        //if DEBUG then console.log('ProjectStore::fetch_directory_listing cb from lock', cb)
        if (typeof cb === "function") {
          cb();
        }
      }
      if (typeof cb === "function") {
        cb();
      }
    },
  );
}
