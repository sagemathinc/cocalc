/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { PostgreSQL } from "../types";
import {
  is_valid_uuid_string,
  search_match,
  search_split,
} from "../../smc-util/misc";
import { query } from "../query";

// This works and does the entire search in the database.
// Unfortunately, it is unusably slow and I just don't have
// the time to do something better right now:
/*
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
*/

// This is dumb but will be sufficiently fast up to probably 5K licenses.
// This is not user facing functionality.  We could maybe restrict to last_used
// in the few months by default (optinally anything) and this would last
// much longer...
export async function matching_site_licenses(
  db: PostgreSQL,
  search: string,
  limit: number = 5
): Promise<{ id: string }[]> {
  if (is_valid_uuid_string(search)) {
    return (
      await db.async_query({
        cache: true,
        query: "SELECT id FROM site_licenses WHERE id=$1",
        params: [search],
      })
    ).rows;
  }
  // Get them all.
  const licenses = (
    await db.async_query({
      query:
        "SELECT id, id || ' ' || coalesce(lower(title),'') || ' ' || coalesce(lower(description),'') || ' ' || coalesce(lower(info::TEXT),'') AS info, managers FROM site_licenses ORDER BY last_used DESC NULLS LAST",
    })
  ).rows;
  // Replace manager account ids by name and email
  const managers: Set<string> = new Set();
  for (const x of licenses) {
    if (x.managers != null) {
      for (const account_id of x.managers) {
        managers.add(account_id);
      }
    }
  }
  const accounts: { [account_id: string]: string } = {};
  for (const row of (
    await db.async_query({
      cache: true,
      query:
        "SELECT account_id, coalesce(lower(first_name),'') || ' ' || coalesce(lower(last_name),'') || ' ' || coalesce(lower(email_address),'') AS info FROM accounts WHERE account_id=ANY($1)",
      params: [Array.from(managers)],
    })
  ).rows) {
    accounts[row.account_id] = row.info;
  }

  const v = search_split(search.toLowerCase());
  const matches: { id: string }[] = [];
  for (const license of licenses) {
    let s = license.info;
    if (license.managers) {
      for (const account_id of license.managers) {
        s += " " + accounts[account_id];
      }
    }
    if (search_match(s, v)) {
      matches.push({ id: license.id as string });
    }
    if (matches.length >= limit) break;
  }

  return matches;
}

export async function manager_site_licenses(
  db: PostgreSQL,
  account_id: string
): Promise<object[]> {
  const query = "SELECT * FROM site_licenses WHERE $1=ANY(managers)";
  const params = [account_id];
  return (await db.async_query({ query, params })).rows;
}

// Return true if the given user is a manager of any site licenses.
export async function is_a_site_license_manager(
  db: PostgreSQL,
  account_id: string
): Promise<boolean> {
  return (
    (
      await query({
        db,
        query: "SELECT COUNT(*) FROM site_licenses WHERE $1=ANY(managers)",
        one: true,
        params: [account_id],
      })
    ).count > 0
  );
}
