/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PostgreSQL } from "../types";
import { query } from "../query";
import { number_of_running_projects_using_license, number_of_projects_with_license_applied } from "./analytics";

export async function site_license_public_info(
  db: PostgreSQL,
  license_id: string
): Promise<number> {
  // Get information about the license itself:
  const obj = await query({
    db,
    select: [
      "title",
      "description",
      "expires",
      "activates",
      "upgrades",
      "quota",
      "run_limit",
      "managers",
    ],
    table: "site_licenses",
    where: { id: license_id },
    one: true,
  });
  if (!obj) throw Error(`no license with id ${license_id}`);

  // Get number of runnings projects with this license applied.
  obj.running = await number_of_running_projects_using_license(db, license_id);
  // Get number of projects with this license applied (may not be running or actually using license).
  obj.applied = await number_of_projects_with_license_applied(db, license_id);

  return obj;
}
