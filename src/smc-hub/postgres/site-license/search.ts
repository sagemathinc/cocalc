/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PostgreSQL } from "../types";
import { search_split } from "../../smc-util/misc";

export async function matching_site_licenses(
  db: PostgreSQL,
  search: string,
  limit: number = 5
): Promise<{ id: string }[]> {
  const where: any[] = [];
  const params: (string | number)[] = [];
  let i = 1;
  for (const s of search_split(search.toLowerCase())) {
    where.push(
      `(lower(site_licenses.title) LIKE $${i}::TEXT OR lower(site_licenses.description) LIKE $${i}::TEXT OR site_licenses.id::TEXT LIKE $${i}::TEXT OR lower(site_licenses.info::TEXT) LIKE $${i}::TEXT OR lower(accounts.first_name) LIKE $${i}::TEXT OR lower(accounts.last_name) LIKE $${i}::TEXT OR lower(accounts.email_address) LIKE $${i}::TEXT)`
    );
    params.push(`%${s}%`);
    i += 1;
  }
  let query =
    "SELECT DISTINCT(site_licenses.id) AS id, site_licenses.last_used FROM site_licenses, accounts WHERE accounts.account_id::TEXT = ANY(site_licenses.managers) AND";
  query += ` (${where.join(" AND ")})`;

  // recently active licenses are much more relevant than old ones
  query += " ORDER BY site_licenses.last_used DESC NULLS LAST";
  query += ` LIMIT $${i}::INTEGER`;
  params.push(limit);
  i += 1;

  return (await db.async_query({ query, params })).rows;
}

export async function manager_site_licenses(
  db: PostgreSQL,
  account_id: string
): Promise<object[]> {
  const query = "SELECT * FROM site_licenses WHERE $1=ANY(managers)";
  const params = [account_id];
  return (await db.async_query({ query, params })).rows;
}
