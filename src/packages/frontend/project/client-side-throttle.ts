/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { redux, useEffect, useState } from "@cocalc/frontend/app-framework";
import { getServerStatsCached } from "@cocalc/frontend/lib/server-stats";

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
   - last chance: it's a blocked country but the limit of trial project has not been reached
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

async function too_many_free_projects(): Promise<boolean> {
  // there are never too many free projects if we're NOT on cocalc.com
  if (not_in_blocked_country()) return false;

  try {
    const stats = await getServerStatsCached();
    const running_projects = stats?.running_projects?.free ?? 0;
    const free_limit =
      redux.getStore("customize")?.get("max_trial_projects") ?? 0;
    return free_limit > 0 && running_projects >= free_limit;
  } catch (err) {
    console.error("error fetching stats", err);
    return false; // we assume it is ok to run a project
  }
}

export async function allow_project_to_run(
  project_id: string
): Promise<boolean> {
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

  // last chance: if the limit of trial projects has not been reached, allow it.
  if (!(await too_many_free_projects())) {
    log("there are not too many free projects running");
    return true;
  }

  // got nothing:
  return false;
}

export function useAllowedFreeProjectToRun(
  project_id: string
): boolean | undefined {
  const [allowed, setAllowed] = useState<boolean | undefined>(undefined);
  useEffect(() => {
    allow_project_to_run(project_id)
      .then(setAllowed)
      .catch((err) => {
        console.error("error in useAllowedFreeProjectToRun", err);
        setAllowed(true); // we assume it is ok to run a project
      });
  }, [project_id]);
  return allowed;
}
