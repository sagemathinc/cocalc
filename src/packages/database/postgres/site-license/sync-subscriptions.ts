/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
Ensure all (or just for given account_id) site license subscriptions
are non-expired iff subscription in stripe is "active" or "trialing".  This actually
uses the "stripe_customer" field of the user account, so its important
that *that* is valid.

2021-03-29: this also checks the other way around:
for each un-expired license check if there is a subscription funding it.
This additional sync is only run if there is no specific account_id set!
*/

import debug from "debug";
const L = debug("hub:sync-subscriptions");

import { PostgreSQL } from "../types";
import { TIMEOUT_S } from "./const";
import { delay } from "awaiting";

// wait this long after writing to the DB, to avoid overwhelming it...
const WAIT_AFTER_UPDATE_MS = 20;

// this is a subset of what's in the "data" field in the DB in stripe_customer -> subscriptions jsonb
interface Subscription {
  id: string; // e.g.  sub_XXX...
  metadata: { license_id?: string; account_id?: string };
  object: string; // "subscription"
  status: string;
  created: number;
  customer: string; // cus_XXXX...
  cancel_at: number | null; // stripe sets this to a timestamp value (secs), if the subscription is set to cancel at period end. oddly enough, the "status" could still "active".
}

// DB query artefact
interface RawSubscriptions {
  rows: {
    sub?: {
      data: Subscription[];
    };
  }[];
}

// map of license_id → list of subscription infos
type LicenseSubs = {
  [license_id: string]: Subscription[];
};

// for each license_id, we want to know if/when it expires and if it is a trial -- trials are ignored
type LicenseInfo = {
  [license_id: string]:
    | { expires: Date | undefined; trial: boolean }
    | undefined;
};

// Get all license expire times from database at once, so we don't
// have to query for each one individually, which would take a long time.
// If account_id is given, we only get the licenses with that user
// as a manager.
// TODO: SCALABILITY WARNING
async function get_licenses(
  db: PostgreSQL,
  account_id?: string,
  expires_unset = false
): Promise<LicenseInfo> {
  const query = {
    select: ["id", "expires", "info"],
    table: "site_licenses",
  } as { select: string[]; table: string; where?: string; params?: string[] };
  if (account_id != null && expires_unset) {
    throw new Error("setting the account_id requires expires_unset == false");
  }
  if (account_id != null) {
    query.where = "$1 = ANY(managers)";
    query.params = [account_id];
  } else if (expires_unset) {
    query.where = "expires IS NULL";
  }
  const results = await db.async_query(query);
  const licenses: LicenseInfo = {};
  for (const x of results.rows) {
    licenses[x.id] = { expires: x.expires, trial: x.info?.trial === true };
  }
  return licenses;
}

// Get *all* stripe subscription data from the database.
// TODO: SCALABILITY WARNING
// TODO: Only the last 10 subs are here, I think, so an old sub might not get properly expired
// for a user that has 10+ subs.  Worry about this when there are such users; maybe there never will be.
async function get_subs(
  db: PostgreSQL,
  account_id?: string
): Promise<LicenseSubs> {
  const subs: RawSubscriptions = await db.async_query({
    select: "stripe_customer#>'{subscriptions}' as sub",
    table: "accounts",
    where:
      account_id == null ? "stripe_customer_id IS NOT NULL" : { account_id },
    timeout_s: TIMEOUT_S,
  });

  const ret: LicenseSubs = {};
  for (const x of subs.rows) {
    if (x.sub?.data == null) continue;
    for (const sub of x.sub.data) {
      const license_id = sub.metadata.license_id;
      if (license_id == null) {
        continue; // not a license
      }
      if (ret[license_id] == null) {
        ret[license_id] = [];
      } else {
        L(`more than one subscription for license '${license_id}'`);
      }
      ret[license_id].push(sub);
    }
  }
  return ret;
}

// there should only be one subscription per license id, but who knows ...
function* iter(subs: LicenseSubs) {
  for (const license_id in subs) {
    const sub_list = subs[license_id];
    for (const sub of sub_list) {
      yield { license_id, sub };
    }
  }
}

// returns true, if this subscription is actively funding
function is_funding(sub): boolean {
  // there are subs, which are "active" but the cancel_at time is in the past and hence are cancelled.
  // that's not in the stripe API but could happen to us here if the account's stripe info is no longer synced
  const cancelled =
    typeof sub.cancel_at === "number"
      ? new Date(sub.cancel_at * 1000) < new Date()
      : false;

  return (sub.status == "active" || sub.status == "trialing") && !cancelled;
}

// for each subscription status, we set the associated license status
// in particular, we don't expect special cases like "trial" or other manual licenses
async function sync_subscriptions_to_licenses(
  db: PostgreSQL,
  licenses: LicenseInfo,
  subs: LicenseSubs,
  test_mode
): Promise<number> {
  let n = 0;
  for (const { license_id, sub } of iter(subs)) {
    const license = licenses[license_id];
    if (license == null) {
      L(
        `WARNING: no known license '${license_id}' for subscription '${sub.id}'`
      );
    }
    const expires: Date | undefined = license?.expires;

    // we check, if the given subscription of that license is still funding it
    if (is_funding(sub)) {
      // make sure expires is not set
      if (expires != null) {
        if (test_mode) {
          L(`DRYRUN: set 'expires = null' where license_id='${license_id}'`);
        } else {
          await db.async_query({
            query: "UPDATE site_licenses",
            set: { expires: null },
            where: { id: license_id },
          });
        }
        await delay(WAIT_AFTER_UPDATE_MS);
        n += 1;
      }
    } else {
      // status is something other than active, so make sure license *is* expired.
      // It will only un-expire when the subscription is active again.
      if (expires == null || expires > new Date()) {
        if (test_mode) {
          L(
            `DRYRUN: set 'expires = ${new Date().toISOString()}' where license_id='${license_id}'`
          );
        } else {
          await db.async_query({
            query: "UPDATE site_licenses",
            set: { expires: new Date() },
            where: { id: license_id },
          });
        }
        await delay(WAIT_AFTER_UPDATE_MS);
        n += 1;
      }
    }
  }
  return n;
}

// this handles the case when the subscription, which is funding a license key, has been cancelled.
// hence this checks all active licenses without an expiration, if there is still an associated subscription.
// if not, the license is expired.
// keep in mind there are special licenses like "trials", which aren't funded and might not have an expiration...
async function expire_cancelled_subscriptions(
  db: PostgreSQL,
  subs: LicenseSubs,
  test_mode: boolean
): Promise<number> {
  let n = 0;

  // this query already filters by expires == null
  const licenses: LicenseInfo = await get_licenses(db, undefined, true);

  for (const license_id in licenses) {
    let funded: number | false = false;

    if (subs[license_id] != null) {
      let i = 0;
      for (const sub of subs[license_id]) {
        if (is_funding(sub)) {
          funded = i;
          break;
        }
        i += 1;
      }
    }

    if (typeof funded === "number") {
      L(
        `license_id '${license_id}' is funded by '${subs[license_id][funded].id}'`
      );
    } else {
      const msg = `license_id '${license_id}' is not funded by any subscription`;
      // maybe trial without expiration?
      if (licenses[license_id]?.trial) {
        L(`${msg}, but it is a trial`);
      } else {
        L(`${msg}`);
        if (test_mode) {
          L(
            `DRYRUN: set 'expires = ${new Date().toISOString()}' where license_id='${license_id}'`
          );
        } else {
          await db.async_query({
            query: "UPDATE site_licenses",
            set: { expires: new Date() },
            where: { id: license_id },
          });
        }
        await delay(WAIT_AFTER_UPDATE_MS);
        n += 1;
      }
    }
  }

  return n;
}

// call this to sync subscriptions <-> site licenses.
// if there is an account_id, it only syncs the given users' subscription to the license
export async function sync_site_license_subscriptions(
  db: PostgreSQL,
  account_id?: string,
  test_mode = false
): Promise<number> {
  test_mode = test_mode || !!process.env.DRYRUN;
  if (test_mode) L(`DRYRUN TEST MODE -- UPDATE QUERIES ARE DISABLED`);

  const licenses: LicenseInfo = await get_licenses(db, account_id);
  const subs = await get_subs(db, account_id);

  let n = await sync_subscriptions_to_licenses(db, licenses, subs, test_mode);

  if (account_id == null) {
    n += await expire_cancelled_subscriptions(db, subs, test_mode);
  }

  return n;
}
