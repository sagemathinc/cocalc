/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
 * lic
 */

// Given an immutable.js project object (from the project_map),
// these functions allow you to query some things about it.

import { redux } from "../app-framework";

export function has_internet_access(project_id?: string): boolean {
  if (project_id == null) return false;
  const store = redux.getStore("projects");
  return !!store.get_total_project_quotas(project_id)?.network;
}
