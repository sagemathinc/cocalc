#!/usr/bin/node

/*
1. Periodically pull all data from Stripe for now. The only point of this is
to ensure there isn't drift between stripe and our database. Any time a user
actually looks at their subscription info, or an admin updates the stripe info
(by 'add user to stripe' in account settings) the info is also synced. So this
is not super important.

TODO: Obviously, we should redo this to only pull maybe once per week (?) AND
also have a webhook so that any changes in stripe are immediately reflected here...

2. Periodically

This is run as a singleton deployment on some preemptible.
*/

const ms = require("ms");
const postgres = require("@cocalc/database");
const { stripe_sync } = require("@cocalc/server/stripe/sync");
const { callback2 } = require("@cocalc/util/async-utils");

const db = postgres.db({ ensure_exists: false });

async function do_stripe_sync() {
  console.log("doing stripe_sync...");
  await stripe_sync({
    database: db,
    logger: { debug: console.log },
  });
  console.log("did stripe_sync");
}

// make sure site licenses subscriptions are not expired iff they are active in stripe
// 2021-03: this now also checks if each license's subscription is still funding it (not cancelled)
async function do_sync_site_licenses() {
  console.log("doing sync site licenses...");
  await db.sync_site_license_subscriptions();
  console.log("did sync site licenses");
}

// make sure all user upgrades to projects are valid and consistent
// (e.g. if upgrades expire remove them)
async function upgrade_check() {
  console.log("doing project upgrade_check...");
  await callback2(db.ensure_all_user_project_upgrades_are_valid.bind(db), {
    limit: 1,
  });
  console.log("done with project upgrade_check");
}

async function main() {
  console.log("doing the stripe related periodic tasks...");
  try {
    await do_stripe_sync();
  } catch (err) {
    console.log(`ERROR do_stripe_sync -- ${err}`);
  }
  try {
    await do_sync_site_licenses();
  } catch (err) {
    console.log(`ERROR do_sync_site_licenses -- ${err}`);
  }
  try {
    await upgrade_check();
  } catch (err) {
    console.log(`ERROR upgrade_check -- ${err}`);
  }
  console.log("success -- waiting 5 hours before doing them again...");
  setTimeout(main, ms("5 hours"));
}

main();
