import getConn from "@cocalc/server/stripe/connection";
import { getStripeCustomerId } from "../create-stripe-checkout-session";
import createSubscription from "../create-subscription";
import getPool, { getTransactionClient } from "@cocalc/database/pool";
import { getNextClosingDate } from "../closing-date";
import dayjs from "dayjs";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("purchases:legacy:subscriptions");

export async function migrateAllActiveLicenseSubscriptions() {
  const pool = getPool();
  logger.debug(
    "migrateAllActiveLicenseSubscriptions: getting all accounts that touched stripe..."
  );
  const { rows } = await pool.query(
    "SELECT account_id FROM accounts WHERE stripe_customer_id IS NOT NULL"
  );
  logger.debug(
    "migrateAllActiveLicenseSubscriptions: got ",
    rows.length,
    "accounts"
  );
  let i = 1;
  for (const { account_id } of rows) {
    logger.debug("migrateAllActiveLicenseSubscriptions:", i, "/", rows.length, {
      account_id,
    });
    await migrateActiveLicenseSubscriptions(account_id);
    i += 1;
  }
}

export async function migrateActiveLicenseSubscriptions(account_id: string) {
  const subs = await getActiveLicenseSubscriptions(account_id);
  logger.debug(
    "migrateActiveLicenseSubscriptions",
    { account_id },
    "got ",
    subs.length,
    " active subscriptions to migrate"
  );
  for (const sub of subs) {
    logger.debug("migrating", sub.metadata);
    await migrateSubscription(sub);
    logger.debug("canceling", sub.metadata);
    await cancelStripeSubscription(sub.id);
  }
}

/*
Get all of the current active stripe subscriptions for the given account.
This ignores non-active subscriptions, since there is no need to do anything
with them anymore.
*/
export async function getActiveLicenseSubscriptions(account_id: string) {
  const stripe = await getConn();
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (!customer) return [];
  const resp = await stripe.subscriptions.list({
    limit: 100,
    customer,
    status: "active",
  });
  if (resp.has_more) {
    throw Error("TODO: have to handle paging");
  }
  return resp.data.filter(
    (sub) =>
      (sub as any).plan?.product.startsWith("license") &&
      sub.metadata.license_id
  );
}

/*
Given a stripe subscription sub, as a single atomic DB transaction we:

- Create the corresponding new subscription in our database
- Set the expire date of the license to match the user's 
  statement day (no charge, so we directly edit the database
  entry for the license).
- Set the subscription id of the license to the new subscription.

It's safe to call this more than once with the same input; the second
time we detect the subscription is already setup and it's a no-op.
*/
export async function migrateSubscription(sub) {
  logger.debug("migrateSubscription", sub.metadata);
  if (sub.plan.product == "cocalc-automatic-billing") {
    // this is already a new subscription.
    throw Error("attempt to migrate new automatic billing subscription");
  }
  const { account_id, license_id } = sub.metadata;

  // check if this was already migrated
  if (await licenseHasModernSubscription(license_id)) {
    logger.debug("migrateSubscription", { license_id }, "already migrated!");
    return;
  }

  // we give them up to almost a free month in the conversion
  const nextClosingDate = await getNextClosingDate(account_id);
  const current_period_end = dayjs(nextClosingDate).add(1, "month").toDate();
  const current_period_start = dayjs(current_period_end)
    .subtract(1, "month")
    .toDate();

  const client = await getTransactionClient();
  try {
    logger.debug("create the new subscription that manages this license", {
      license_id,
    });
    const subscription_id = await createSubscription(
      {
        account_id,
        cost: sub.plan.amount / 100, // grandfathered pricing
        interval: sub.plan.interval,
        current_period_start,
        current_period_end,
        status: "active",
        metadata: { type: "license", license_id },
      },
      client
    );
    logger.debug("created the new subscription that manages this license", {
      subscription_id,
    });
    logger.debug(
      "set the expire date and subscription_id for the license (no cost)",
      { current_period_end }
    );
    await client.query(
      "UPDATE site_licenses SET expires=$1, subscription_id=$2 WHERE id=$3",
      [current_period_end, subscription_id, license_id]
    );
    await client.query("UPDATE subscriptions SET notes=$1 WHERE id=$2", [
      `Created by migrating legacy stripe license subscription ${sub.id}.`,
      subscription_id,
    ]);
    logger.debug("finished migrating -- COMMIT", sub.metadata);

    await client.query("COMMIT");
  } catch (err) {
    logger.debug("error migrating", sub.metadata, err, " -- ROLLBACK");
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function licenseHasModernSubscription(
  license_id: string
): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT subscription_id FROM site_licenses WHERE id=$1",
    [license_id]
  );
  return rows[0].subscription_id != null;
}

export async function cancelStripeSubscription(id: string) {
  logger.debug("cancelStripeSubscription", id);
  const stripe = await getConn();
  await stripe.subscriptions.cancel(id);
}
