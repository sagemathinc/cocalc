/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*

/*
Ensure all (or just for given account_id) site license subscriptions
are non-expired iff subscription in stripe is "active".  This actually
uses the "stripe_customer" field of the user account, so its important
that *that* is valid.
*/

import { PostgreSQL } from "../types";

export async function sync_site_license_subscriptions(
  db: PostgreSQL,
  account_id?: string
): Promise<number> {
  // Get all license expire times from database at once, so we don't
  // have to query for each one individually, which would take a long time.
  // If account_id is given, we only get the licenses with that user
  // as a manager.
  // TODO: SCALABILITY WARNING
  const query = {
    select: ["id", "expires"],
    table: "site_licenses",
  } as { select: string[]; table: string; where?: string; params?: string[] };
  if (account_id != null) {
    query.where = "$1 = ANY(managers)";
    query.params = [account_id];
  }
  const results = await db.async_query(query);
  const licenses: { [license_id: string]: Date | undefined } = {};
  for (const x of results.rows) {
    licenses[x.id] = x.expires;
  }
  // Get *all* stripe subscription data from the database.
  // TODO: SCALABILITY WARNING
  // TODO: Only the last 10 subs are here, I think, so an old sub might not get properly expired
  // for a user that has 10+ subs.  Worry about this when there are such users; maybe there never will be.
  const subs = await db.async_query({
    select: "stripe_customer#>'{subscriptions}' as sub",
    table: "accounts",
    where:
      account_id == null ? "stripe_customer_id IS NOT NULL" : { account_id },
  });

  let n = 0;
  for (const x of subs.rows) {
    if (x.sub?.data == null) continue;
    for (const sub of x.sub.data) {
      if (sub.metadata.license_id == null) {
        continue; // not a license
      }
      const expires = licenses[sub.metadata.license_id];
      if (sub.status == "active") {
        // make sure expires is not set
        if (expires != null) {
          await db.async_query({
            query: "UPDATE site_licenses",
            set: { expires: null },
            where: { id: sub.metadata.license_id },
          });
          n += 1;
        }
      } else {
        // status is something other than active, so make sure license *is* expired.
        // It will only un-expire when the subscription is active again.
        if (expires == null || expires > new Date()) {
          await db.async_query({
            query: "UPDATE site_licenses",
            set: { expires: new Date() },
            where: { id: sub.metadata.license_id },
          });
          n += 1;
        }
      }
    }
  }
  return n;
}
