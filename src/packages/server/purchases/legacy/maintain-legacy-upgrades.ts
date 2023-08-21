import getLogger from "@cocalc/backend/logger";
const logger = getLogger("purchases:maintenane-legacy-upgrades");

import syncCustomer from "@cocalc/database/postgres/stripe/sync-customer";
import getConn from "@cocalc/server/stripe/connection";
import getPool from "@cocalc/database/pool";

let lastDone = 0;
export default async function maintainLegacyUpgrades() {
  const now = Date.now();
  if (now - lastDone < 1000 * 60 * 60 * 4) {
    logger.debug("done in the last 4 hours so skipping");
    return;
  }
  lastDone = now;
  const stripe = await getConn();
  const pool = getPool();

  // this is just 100 or so...
  const { rows } = await pool.query(
    "SELECT account_id, stripe_customer FROM accounts WHERE stripe_customer IS NOT NULL AND last_active >= NOW() - interval '1 month'"
  );
  for (const { account_id, stripe_customer } of rows) {
    // restricting to only those with legacy subscriptions helps cut it down a lot.
    // This should be fine since you can't make a new subscription, so anybody we need
    // to sync has one.
    if (hasLegacySubscription(stripe_customer.subscriptions)) {
      await syncCustomer({ stripe, account_id });
    }
  }
}

function hasLegacySubscription(subscriptions): boolean {
  for (const sub of subscriptions?.data ?? []) {
    if (sub.metadata?.service == null) {
      return true;
    }
  }
  return false;
}
