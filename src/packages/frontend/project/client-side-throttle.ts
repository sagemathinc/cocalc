/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { redux } from "../app-framework";

/*
Client-side throttling of running projects in blocked countries.  This may or may not be the
right approach to this problem... we'll see.

We allow a project to run if any of these conditions is satisfied:

   - not in a blocked country
   - any license is applied to the project
   - any upgrades are applied to the project
   - admin member upgrade
   - is a project in a course (don't interfere with instructors/students)
   - project already running or starting for some reason
*/

function not_in_blocked_country() {
  const customize = redux.getStore("customize");
  if (customize == null) return true; // don't know
  const country = customize.get("country");
  if (country == null) return true;
  const nonfree_countries = customize.get("nonfree_countries");
  if (nonfree_countries == null) return true;
  return !nonfree_countries.contains(country);
}

export function allow_project_to_run(project_id: string): boolean {
  function log(..._args) {
    // console.log("allow_project_to_run", project_id, ..._args);
  }

  if (not_in_blocked_country()) {
    log("not blocked country");
    return true;
  }

  const store = redux.getStore("projects");
  const state = store.get_state(project_id);
  if (state == "running" || state == "starting") {
    log("already running or starting");
    return true;
  }

  const project = store.getIn(["project_map", project_id]);
  if (project == null) {
    log("don't know project, maybe user is admin, maybe things aren't loaded");
    return true;
  }

  if (project.get("course") != null) {
    log("don't mess with students in course");
    return true;
  }

  const upgrades = store.get_total_project_upgrades(project_id);
  if (upgrades != null) {
    for (const name in upgrades) {
      if (upgrades[name]) {
        log("some upgrade exists, so run.");
        return true;
      }
    }
  }

  if (project.getIn(["settings", "member_host"])) {
    log("has admin upgrade of member hosting.");
    return true;
  }

  // maybe there is a license (valid or not -- we won't check at this point)
  if (store.get_site_license_ids(project_id).length > 0) {
    log("a license is applied");
    return true;
  }

  // got nothing:
  return false;
}
