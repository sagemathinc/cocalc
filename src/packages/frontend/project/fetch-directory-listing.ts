import { is_running_or_starting } from "./project-start-warning";
import type { ProjectActions } from "@cocalc/frontend/project_actions";
import { trunc_middle, uuid } from "@cocalc/util/misc";
import { get_directory_listing2 as get_directory_listing } from "./directory-listing";
import { fromJS } from "immutable";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";

//const log = (...args) => console.log("fetchDirectoryListing", ...args);
const log = (..._args) => {};

interface FetchDirectoryListingOpts {
  path?: string;
  // WARNING: THINK VERY HARD BEFORE YOU USE force=true, due to efficiency!
  force?: boolean;
}

function getPath(
  actions,
  opts?: FetchDirectoryListingOpts,
): string | undefined {
  let store = actions.get_store();
  return opts?.path ?? store?.get("current_path");
}

const fetchDirectoryListing = reuseInFlight(
  async (
    actions: ProjectActions,
    { path, force }: FetchDirectoryListingOpts = {},
  ): Promise<void> => {
    let status;
    let store = actions.get_store();
    if (store == null) {
      return;
    }
    path = getPath(actions, { path });

    if (force && path != null) {
      // update our interest.
      store.get_listings().watch(path, true);
    }
    log({ force, path });

    if (path == null) {
      // nothing to do if path isn't defined -- there is no current path --
      // see https://github.com/sagemathinc/cocalc/issues/818
      return;
    }

    const id = uuid();
    if (path) {
      status = `Loading file list - ${trunc_middle(path, 30)}`;
    } else {
      status = "Loading file list";
    }

    let value;
    try {
      // only show actions indicator, if the project is running or starting
      // if it is stopped, we get a stale listing from the database, which is fine.
      if (is_running_or_starting(actions.project_id)) {
        log("show activity");
        actions.set_activity({ id, status });
      }

      log("make sure user is fully signed in");
      await actions.redux.getStore("account").async_wait({
        until: (s) => s.get("is_logged_in") && s.get("account_id"),
      });

      log("getting listing");
      const listing = await get_directory_listing({
        project_id: actions.project_id,
        path,
        hidden: true,
        max_time_s: 10,
        trigger_start_project: false,
        group: "collaborator", // nothing else is implemented
      });
      log("got ", listing.files);
      value = fromJS(listing.files);
    } catch (err) {
      log("error", err);
      value = `${err}`;
    } finally {
      log("saving result");
      actions.set_activity({ id, stop: "" });
      store = actions.get_store();
      if (store == null) {
        return;
      }
      const map = store.get("directory_listings").set(path, value);
      actions.setState({ directory_listings: map });
    }
  },
  {
    createKey: (args) => {
      const actions = args[0];
      return `${actions.project_id}${getPath(actions, args[1])}`;
    },
  },
);

export default fetchDirectoryListing;
