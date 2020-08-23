/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PostgreSQL } from "../types";
import { query } from "../query";

export async function site_license_is_manager(
  db: PostgreSQL,
  account_id: string,
  license_id: string
): Promise<boolean> {
  return (
    (
      await query({
        db,
        query:
          "SELECT COUNT(*) FROM site_licenses WHERE id=$1 AND $2 = ANY(managers)",
        one: true,
        params: [license_id, account_id],
      })
    ).count > 0
  );
}

export async function site_license_manager_set(
  db: PostgreSQL,
  account_id: string,
  info: { id: string; title?: string; description?: string }
): Promise<void> {
  // First make sure they really are a manager
  if (!(await site_license_is_manager(db, account_id, info.id))) {
    throw Error("user must be a manager of the license to change it");
  }
  const set: { title?: string; description?: string } = {};
  if (info.title != null) set.title = info.title;
  if (info.description != null) set.description = info.description;
  // Now do the query
  await db.async_query({
    query: "UPDATE site_licenses",
    set,
    where: { id: info.id },
  });
}
