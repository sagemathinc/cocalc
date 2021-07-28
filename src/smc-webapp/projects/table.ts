import { reuseInFlight } from "async-await-utils/hof";
import { COCALC_MINIMAL } from "../fullscreen";
import { parse_query } from "smc-util/sync/table/util";
import { once } from "smc-util/async-utils";
import { redux, Table } from "../app-framework";

declare var DEBUG: boolean;

// Create and register projects table, which gets automatically
// synchronized with the server.
class ProjectsTable extends Table {
  query() {
    const project_id = redux.getStore("page").get("kiosk_project_id");
    if (project_id != null) {
      // In kiosk mode we load only the relevant project.
      const query = parse_query("projects_all");
      query["projects_all"][0].project_id = project_id;
      return query;
    } else {
      return "projects";
    }
  }

  _change(table, _keys) {
    // in kiosk mode, merge in the new project table into the known project map
    let project_map;
    const project_id = redux.getStore("page").get("kiosk_project_id");
    const actions = redux.getActions("projects");
    if (project_id != null) {
      let new_project_map;
      project_map = redux.getStore("projects")?.get("project_map");
      if (project_map != null) {
        new_project_map = project_map.merge(table.get());
      } else {
        new_project_map = table.get();
      }
      return actions.setState({ project_map: new_project_map });
    } else {
      return actions.setState({ project_map: table.get() });
    }
  }
}

class ProjectsAllTable extends Table {
  query() {
    return "projects_all";
  }

  _change(table, _keys) {
    const actions = redux.getActions("projects");
    return actions.setState({ project_map: table.get() });
  }
}

/*
We define functions below that load all projects or just the recent
ones.  First we try loading the recent ones.  If this is *empty*,
then we try loading all projects.  Loading all projects is also automatically
called if there is any attempt to open a project that isn't recent.
Why? Because the load_all_projects query is potentially **expensive**.
*/

let all_projects_have_been_loaded: boolean = false;

export const load_all_projects = reuseInFlight(async () => {
  if (DEBUG && COCALC_MINIMAL) {
    console.error(
      "projects/load_all_projects was called in kiosk/minimal mode"
    );
  }
  if (all_projects_have_been_loaded) {
    return;
  }
  all_projects_have_been_loaded = true; // used internally in this file only to be optimally fast.
  redux.removeTable("projects");
  redux.createTable("projects", ProjectsAllTable);
  await once(redux.getTable("projects")._table, "connected");
  redux
    .getActions("projects")
    ?.setState({ all_projects_have_been_loaded: true }); // used by client code
});

async function load_recent_projects(): Promise<void> {
  const table = redux.createTable("projects", ProjectsTable);
  await once(table._table, "connected");
  if (table._table.get().size === 0) {
    // WARNING: that the following is done is assumed in
    // render_new_project_creator! See
    // https://github.com/sagemathinc/cocalc/issues/4306
    await redux.getActions("projects").load_all_projects();
  }
}

export function init() {
  if (!COCALC_MINIMAL) {
    load_recent_projects();
  }
}

const project_tables = {};
let previous_project_id: string | undefined = undefined;

// This function makes it possible to switch between projects in kiosk mode.
// If the project changes, it also recreates the users table.
// Warning: https://github.com/sagemathinc/cocalc/pull/3985#discussion_r336828374
export async function switch_to_project(project_id: string): Promise<void> {
  redux.getActions("page").setState({ kiosk_project_id: project_id });
  if (previous_project_id !== project_id) {
    const { recreate_users_table } = await import("../users");
    recreate_users_table();
    previous_project_id = project_id;
  }
  const cached_project_table = project_tables[project_id];
  if (cached_project_table) {
    redux.setTable(project_id, cached_project_table);
  } else {
    redux.removeTable("projects");
    const pt = redux.createTable("projects", ProjectsTable);
    project_tables[project_id] = pt;
    await once(redux.getTable("projects")._table, "connected");
  }
}
