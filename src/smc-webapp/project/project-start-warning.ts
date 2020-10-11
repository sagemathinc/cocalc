/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux } from "../app-framework";

/* Various actions depend on the project running, so this function currently does the following:
    - Checks whether or not the project is starting or running (assuming project state known -- admins don't know).
    - If running, displays nothing and returns true.
    - If not running displays a project-level modal alert and waits --
       - if user asks to start, then starts and returns true.
       - if user since don't start, return false.

NOTE:
 - I hate this code.  It was very difficult to write.  I'm sorry.

*/

// This explicitly_started is because otherwise is_running_or_starting
// can't **immediately* detect starting the project.
const explicitly_started: { [project_id: string]: number } = {};

function is_running_or_starting(project_id: string): boolean {
  const t = explicitly_started[project_id];
  if (t != null && new Date().valueOf() - t <= 15000) return true;

  const project_map = redux.getStore("projects")?.get("project_map");
  if (!project_map) return false;
  const state = project_map.getIn([project_id, "state", "state"]);
  if (state == null || state == "running" || state == "starting") return true;

  const x = project_map?.getIn([project_id, "action_request"]);
  if (x == null) return false;
  const action = x.get("action");
  const finished = x.get("finished");
  const time = new Date(x.get("time"));
  if (action == "start" && (finished == null || finished < time)) {
    return true;
  }
  return false;
}

export async function ensure_project_running(
  project_id: string,
  what: string
): Promise<boolean> {
  if (is_running_or_starting(project_id)) {
    return true;
  }
  const project_actions = redux.getProjectActions(project_id);
  await project_actions.wait_until_no_modals();
  let result: string = "";
  const interval = setInterval(() => {
    if (result != "") {
      clearInterval(interval);
      return;
    }
    if (is_running_or_starting(project_id)) {
      clearInterval(interval);
      project_actions.clear_modal();
    }
  }, 1000);
  result = await project_actions.show_modal({
    title: "Start Project?",
    content: `You must start the project before you can ${what}.  Would you like to start the project?`,
  });
  if (result == "ok") {
    explicitly_started[project_id] = new Date().valueOf();
    redux.getActions("projects").start_project(project_id);
    return true;
  }
  return is_running_or_starting(project_id);
}
