/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { redux } from "@cocalc/frontend/app-framework";
import { dialogs } from "@cocalc/frontend/i18n";
import { getIntl } from "@cocalc/frontend/i18n/get-intl";

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

export function is_running_or_starting(project_id: string): boolean {
  if (redux.getStore("customize").get("lite")) {
    return true;
  }
  const t = explicitly_started[project_id];
  if (t != null && Date.now() - t <= 15000) {
    return true;
  }

  const project_map = redux.getStore("projects")?.get("project_map");
  if (!project_map) {
    return false;
  }
  const state = project_map.getIn([project_id, "state", "state"]);
  if (state == null || state == "running" || state == "starting") {
    return true;
  }

  const x = project_map?.get(project_id)?.get("action_request");
  if (x == null) {
    return false;
  }
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
  what: string,
): Promise<boolean> {
  const intl = await getIntl();
  const project_actions = redux.getProjectActions(project_id);
  await project_actions.wait_until_no_modals();
  if (is_running_or_starting(project_id)) {
    return true;
  }

  let result: string = "";

  const project_title = redux.getStore("projects").get_title(project_id);
  const title = intl.formatMessage(dialogs.project_start_warning_title);
  const content = intl.formatMessage(dialogs.project_start_warning_content, {
    project_title,
    title,
    what,
  });

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

  result = await project_actions.show_modal({ title, content });
  if (result == "ok") {
    explicitly_started[project_id] = Date.now();
    redux.getActions("projects").start_project(project_id);
    return true;
  }
  return is_running_or_starting(project_id);
}
