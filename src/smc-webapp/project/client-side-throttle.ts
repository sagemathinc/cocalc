/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux } from "../app-framework";

/*
Client-side throttling of running projects.  This may or may not be the
right approach to this problem... we'll see.

We allow a project to run if any of these conditions is satisfied:

   - the global limit on free projects has not been reached (or there is no global limit)
   - the account asking to run the project has any assocaited stripe info
     (e.g., because they bought something or entered a card at some point)
   - any license is applied to the project
   - any upgrades are applied to the project
*/

// Maximum number of free projects to allow at once.
const FREE_LIMIT = 1000;

export function allow_project_to_run(project_id: string): boolean {
  if (window.location.host != "cocalc.com") {
    // For now we are hardcoding this functionality only for cocalc.com.
    // It will be made generic and configurable later once we have
    // **some experience** with it.
    return true;
  }

  const store = redux.getStore("projects");
  const state = store.get_state(project_id);
  if (state == "running" || state == "starting") {
    // if already running or starting, no point in not allowing it to start.
    return true;
  }

  const free: number =
    redux.getStore("server_stats")?.getIn(["running_projects", "free"]) ?? 0;

  if (free < FREE_LIMIT) {
    // not too many projects -- let it run!
    return true;
  }

  // Is this project "free"?
  const project = store.getIn(["project_map", project_id]);
  if (project == null) {
    // don't know (maybe user is admin, maybe things aren't loaded)
    return true;
  }

  const upgrades = store.get_total_project_upgrades(project_id);
  if (upgrades != null) {
    for (const name in upgrades) {
      if (upgrades[name]) {
        // some upgrade exists, so run with it.
        return true;
      }
    }
  }

  // maybe there is a license (valid or not -- we won't check at this point)
  if (store.get_site_license_ids(project_id).length > 0) {
    return true;
  }

  // got nothing:
  return false;
}

(window as any).allow_project_to_run = allow_project_to_run;
