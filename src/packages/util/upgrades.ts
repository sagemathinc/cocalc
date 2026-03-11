/*
 *  This file is part of CoCalc: Copyright © 2020–2026 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { PROJECT_UPGRADES } from "./schema";
import { cmp, map_sum } from "./misc";

// This is used by the frontend in r_account.  It's also used by the backend
// to double check the claims of the frontend.
// stripe_subscriptions_data = stripe_customer?.subscriptions?.data
export function get_total_upgrades(stripe_subscriptions_data, DEBUG = false) {
  if (DEBUG) {
    return PROJECT_UPGRADES.subscription.professional.benefits;
  }

  const subs = stripe_subscriptions_data;
  if (subs == null) {
    return {};
  }
  // always running isn't in any of the subscriptions and I don't want to edit benefits
  // for all of them, so just put a zero 0 (since this whole old upgrades thing
  // will eventually go away). https://github.com/sagemathinc/cocalc/issues/4802
  let total: Record<string, number> = { always_running: 0 };
  for (let sub of subs) {
    if (sub.status != "active" && sub.status != "trialing") {
      // not yet paid for or no longer available.
      continue;
    }
    const info = PROJECT_UPGRADES.subscription[sub.plan.id.split("-")[0]];
    if (info == null) {
      // there are now some subscriptions that have nothing to do with "upgrades" (e.g., for licenses).
      continue;
    }
    const benefits = info.benefits;
    for (let q = 0; q < sub.quantity; q++) {
      total = map_sum(total, benefits);
    }
  }
  return total;
}

//
// INPUT:
//    subscriptions = {standard:2, premium:1, course:2, ...}
//    projects = {project_id:{cores:1, network:1, ...}, ...}
//
// OUTPUT:
//     {available:{cores:10, network:3, ...},   excess:{project_id:{cores:2, ...}}  }
//
export function available_upgrades(stripe_subscriptions_data, projects) {
  let project_id, upgrades;
  const available = get_total_upgrades(stripe_subscriptions_data); // start with amount available being your quota
  const excess: Record<string, Record<string, number>> = {}; // nothing exceeds quota
  // sort projects by project_id so that excess will be well defined
  const v: { project_id: string; upgrades: any }[] = [];
  for (project_id in projects) {
    upgrades = projects[project_id];
    v.push({ project_id, upgrades });
  }
  v.sort((a, b) => cmp(a.project_id, b.project_id));
  for ({ project_id, upgrades } of v) {
    for (let prop in upgrades) {
      const curval = upgrades[prop];
      if (available[prop] == null) {
        available[prop] = 0;
      } // ensure that available is defined for this prop
      if (curval <= available[prop]) {
        // if the current value for this project is within what is left, just subtract it off
        available[prop] -= curval;
      } else {
        // otherwise, it goes over, so record by how much in excess, then set available to 0.
        if (excess[project_id] == null) {
          excess[project_id] = {};
        }
        excess[project_id][prop] = curval - available[prop];
        available[prop] = 0;
      }
    }
  }
  return { available, excess };
}

// INPUT: same as above, but also a single project_id
//
// OUTPUT:  Returns the maximum amount for each upgrade setting that a control
// (which starts at 0) for configuring that setting for the project should go up to.
//
//      {cores:2, network:1, disk_quota:2000, memory:1000}
//
//
export function upgrade_maxes(stripe_subscriptions_data, projects, project_id) {
  const { available } = available_upgrades(stripe_subscriptions_data, projects);
  const allocated = projects[project_id];
  const maxes: Record<string, number> = {};
  for (let param in available) {
    const avail = available[param];
    const max = PROJECT_UPGRADES.max_per_project[param]; // the maximum allowed for this param for any project
    const alloc = allocated[param] != null ? allocated[param] : 0; // how much has already been allocated to this project
    maxes[param] = Math.min(alloc + avail, max);
  }
  return maxes;
}
