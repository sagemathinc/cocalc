import getLogger from "@cocalc/backend/logger";
import { currency, round2 } from "@cocalc/util/misc";
import getConn from "@cocalc/server/stripe/connection";
import getPool from "@cocalc/database/pool";
import stripeName from "@cocalc/util/stripe/name";
import { setStripeCustomerId } from "@cocalc/database/postgres/stripe";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { MAX_COST } from "@cocalc/util/db-schema/purchases";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import { stripeToDecimal, decimalToStripe } from "@cocalc/util/stripe/calc";
import type { LineItem } from "@cocalc/util/stripe/types";
import { url } from "@cocalc/server/messages/send";

const MINIMUM_STRIPE_TRANSACTION = 0.5; // Stripe requires transactions to be at least $0.50.

const logger = getLogger("purchases:stripe:util");

async function createStripeCustomer(account_id: string): Promise<string> {
  logger.debug("createStripeCustomer", account_id);
  const db = getPool();
  const { rows } = await db.query(
    "SELECT email_address, first_name, last_name FROM accounts WHERE account_id=$1",
    [account_id],
  );
  if (rows.length == 0) {
    throw Error(`no account ${account_id}`);
  }
  const email = rows[0].email_address;
  const description = stripeName(rows[0].first_name, rows[0].last_name);
  const stripe = await getConn();
  const { id } = await stripe.customers.create({
    description,
    name: description,
    email,
    metadata: {
      account_id,
    },
  });
  logger.debug("createStripeCustomer", "created ", {
    id,
    description,
    email,
    account_id,
  });
  await setStripeCustomerId(account_id, id);
  return id;
}

export async function getStripeCustomerId({
  account_id,
  create,
}: {
  account_id: string;
  create: boolean;
}): Promise<string | undefined> {
  const db = getPool("long");
  const { rows } = await db.query(
    "SELECT stripe_customer_id FROM accounts WHERE account_id=$1",
    [account_id],
  );
  const stripe_customer_id = rows[0]?.stripe_customer_id;
  if (stripe_customer_id) {
    logger.debug(
      "getStripeCustomerId",
      "customer already exists",
      stripe_customer_id,
    );
    return stripe_customer_id;
  }
  if (create) {
    return await createStripeCustomer(account_id);
  } else {
    return undefined;
  }
}

export async function sanityCheckAmount(amount) {
  if (!amount) {
    throw Error("Amount must be nonzero.");
  }
  const { pay_as_you_go_min_payment } = await getServerSettings();
  const minAllowed = Math.max(
    MINIMUM_STRIPE_TRANSACTION,
    pay_as_you_go_min_payment ?? 0,
  );
  if (amount < minAllowed) {
    throw Error(
      `Amount ${currency(round2(amount))} must be at least ${currency(minAllowed)}.`,
    );
  }
  if (amount > MAX_COST) {
    throw Error(
      `Amount ${currency(round2(amount))} exceeds the maximum allowed amount of ${currency(MAX_COST)}.  Please contact support.`,
    );
  }
}

// this gets the account_id with a given stripe_id....
export async function getAccountIdFromStripeCustomerId(
  customer: string,
): Promise<string | undefined> {
  const pool = getPool();
  // I think this is a linear search on the entire accounts table, probably.
  // This should basically never happen, but I'm implementing it just
  // in case.
  const { rows } = await pool.query(
    "SELECT account_id FROM accounts WHERE stripe_customer_id=$1",
    [customer],
  );
  if (rows.length == 1) {
    // clear answer and done
    return rows[0]?.account_id;
  }
  // Next query stripe itself:
  const stripe = await getConn();
  try {
    const customerObject = await stripe.customers.retrieve(customer);
    const account_id = customerObject["metadata"]?.["account_id"];
    if (account_id && (await isValidAccount(account_id))) {
      // check if it is valid, because, e.g., stripe might have all kinds
      // of crazy data... e.g., all dev servers use the SAME stripe testing
      // account.  Also the account could be purged from our records, so
      // no further processing is possible.
      return account_id;
    }
  } catch (_err) {
    // ddidn't find via stripe
  }
  // at least try the first result if there is more than 1, or return undefined.
  return rows[0]?.account_id;
}

// could this be done better?
export async function defaultReturnUrl() {
  const return_url = await url();
  return return_url;
}

export function assertValidUserMetadata(metadata) {
  if (
    metadata?.purpose != null ||
    metadata?.account_id != null ||
    metadata?.confirm != null ||
    metadata?.processed != null ||
    metadata?.recorded != null ||
    metadata?.total_excluding_tax_usd != null
  ) {
    throw Error(
      "metadata must not include 'purpose', 'account_id', 'confirm', 'total_excluding_tax_usd', 'recorded', or 'processed' as a key",
    );
  }
}

export function getStripeLineItems(lineItems: LineItem[]): {
  lineItemsWithoutCredit: LineItem[];
  total_excluding_tax_usd: number;
} {
  let credit = 0;
  let total_excluding_tax_usd = 0;
  for (const item of lineItems) {
    const amount = decimalToStripe(item.amount);
    if (item.amount < 0) {
      credit += Math.abs(amount);
    }
    total_excluding_tax_usd += amount;
  }
  if (credit == 0) {
    // no credits
    return { lineItemsWithoutCredit: lineItems, total_excluding_tax_usd };
  }
  if (total_excluding_tax_usd <= 0) {
    throw Error("invalid payment: credits are at least as much as charges");
  }
  // reduce charges to use up the credits
  const newLineItems: LineItem[] = [];
  for (const item of lineItems) {
    const amount = decimalToStripe(item.amount);
    if (amount < 0) {
      // a credit
      continue;
    }
    const creditToUse = Math.min(amount, credit);
    if (creditToUse == 0) {
      newLineItems.push(item);
    } else {
      const amount2 = amount - creditToUse;
      credit -= creditToUse;
      newLineItems.push({
        description:
          item.description +
          ` (${currency(stripeToDecimal(creditToUse))} credit deducted from your account)`,
        amount: stripeToDecimal(amount2),
      });
    }
  }

  return { lineItemsWithoutCredit: newLineItems, total_excluding_tax_usd };
}
