//##############################################################################
//
//    CoCalc: Collaborative Calculation in the Cloud
//
//    Copyright (C) 2016, Sagemath Inc.
//
//    This program is free software: you can redistribute it and/or modify
//    it under the terms of the GNU General Public License as published by
//    the Free Software Foundation, either version 3 of the License, or
//    (at your option) any later version.
//
//    This program is distributed in the hope that it will be useful,
//    but WITHOUT ANY WARRANTY; without even the implied warranty of
//    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
//    GNU General Public License for more details.
//
//    You should have received a copy of the GNU General Public License
//    along with this program.  If not, see <http://www.gnu.org/licenses/>.
//
//##############################################################################

const { PROJECT_UPGRADES } = require("./schema");

const misc = require("./misc");

// This is used by the frontend in r_account.  It's also used by the backend
// to double check the claims of the frontend.
// stripe_subscriptions_data = stripe_customer?.subscriptions?.data
function get_total_upgrades(stripe_subscriptions_data) {
  const subs = stripe_subscriptions_data;
  if (subs == null) {
    return {};
  }
  let total = {};
  for (let sub of subs) {
    for (let q = 0; q < subs.quantity; q++) {
      total = misc.map_sum(
        total,
        PROJECT_UPGRADES.subscription[sub.plan.id.split("-")[0]].benefits
      );
    }
  }
  return total;
}

exports.get_total_upgrades = get_total_upgrades;

//
// INPUT:
//    subscriptions = {standard:2, premium:1, course:2, ...}
//    projects = {project_id:{cores:1, network:1, ...}, ...}
//
// OUTPUT:
//     {available:{cores:10, network:3, ...},   excess:{project_id:{cores:2, ...}}  }
//
function available_upgrades(stripe_subscriptions_data, projects) {
  let project_id, upgrades;
  const available = get_total_upgrades(stripe_subscriptions_data); // start with amount available being your quota
  const excess = {}; // nothing exceeds quota
  // sort projects by project_id so that excess will be well defined
  const v = [];
  for (project_id in projects) {
    upgrades = projects[project_id];
    v.push({ project_id, upgrades });
  }
  v.sort((a, b) => misc.cmp(a.project_id, b.project_id));
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
exports.available_upgrades = available_upgrades;

// INPUT: same as above, but also a single project_id
//
// OUTPUT:  Returns the maximum amount for each upgrade setting that a control
// (which starts at 0) for configuring that setting for the project should go up to.
//
//      {cores:2, network:1, disk_quota:2000, memory:1000}
//
//
function upgrade_maxes(stripe_subscriptions_data, projects, project_id) {
  const { available, excess } = available_upgrades(
    stripe_subscriptions_data,
    projects
  );
  const allocated = projects[project_id];
  const maxes = {};
  for (let param in available) {
    const avail = available[param];
    const max = PROJECT_UPGRADES.max_per_project[param]; // the maximum allowed for this param for any project
    const alloc = allocated[param] != null ? allocated[param] : 0; // how much has already been allocated to this project
    maxes[param] = Math.min(alloc + avail, max);
  }
  return maxes;
}

exports.upgrade_maxes = upgrade_maxes;
