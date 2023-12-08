import { is_running_or_starting } from "./project-start-warning";
import type { ProjectActions } from "@cocalc/frontend/project_actions";
import { trunc_middle, uuid } from "@cocalc/util/misc";
import { get_directory_listing2 as get_directory_listing } from "./directory-listing";
import { fromJS } from "immutable";
import { reuseInFlight } from "async-await-utils/hof";

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

    if (path == null) {
      // nothing to do if path isn't defined -- there is no current path --
      // see https://github.com/sagemathinc/cocalc/issues/818
      return;
    }

    // Wait until user is logged in, project store is loaded enough
    // that we know our relation to actions project, namely so that
    // get_my_group is defined.
    const id = uuid();
    if (path) {
      status = `Loading file list - ${trunc_middle(path, 30)}`;
    } else {
      status = "Loading file list";
    }

    let value;
    try {
      // only show actions indicator, if the project is running or starting
      // if it is stopped, we might get a stale listing from the database!
      if (is_running_or_starting(actions.project_id)) {
        actions.set_activity({ id, status });
      }

      // make sure user is fully signed in
      await actions.redux.getStore("account").async_wait({
        until: (s) => s.get("is_logged_in") && s.get("account_id"),
      });

      const projects_store = actions.redux.getStore("projects");
      // make sure that our relationship to actions project is known.
      if (projects_store == null) {
        throw Error("projects_store not yet initialized");
        return;
      }
      const my_group = await projects_store.async_wait({
        until: (s) => (s as any).get_my_group(actions.project_id),
        timeout: 30,
      });

      const listing = await get_directory_listing({
        project_id: actions.project_id,
        path,
        hidden: true,
        max_time_s: 15 * 60, // keep trying for up to 15 minutes
        group: my_group,
        trigger_start_project: false,
      });
      value = fromJS(listing.files);
    } catch (err) {
      value = `${err}`;
    } finally {
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
