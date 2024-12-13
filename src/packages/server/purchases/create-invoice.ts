/*
DEPRECATED!!!!

Create a stripe invoice for a specific amount of money so that when paid
this invoice counts toward your purchases balance.  It has
metadata = {account_id, service:'credit'}

Also, create credit in cocalc when we get an invoice from stripe via a webhook.

Use case:

- making a payment to reduce your balance / credit your account
- paying monthly statement
*/

import getConn from "@cocalc/server/stripe/connection";
import getPool from "@cocalc/database/pool";
import stripeName from "@cocalc/util/stripe/name";
import { setStripeCustomerId } from "@cocalc/database/postgres/stripe";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";
import createCredit from "./create-credit";
import getLogger from "@cocalc/backend/logger";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { markTokenActionPaid } from "@cocalc/server/token-actions/make-payment";
import { currency } from "@cocalc/util/misc";
import { stripeToDecimal, decimalToStripe } from "@cocalc/util/stripe/calc";

const logger = getLogger("purchases:create-invoice");

interface Options {
  account_id: string;
  amount: number; // amount in US Dollars
  description: string;
}

export default async function createInvoice({
  account_id,
  amount,
  description,
}: Options): Promise<{
  id: string;
  paid: boolean;
  hosted_invoice_url: string;
}> {
  logger.debug("createInvoice", { account_id, amount, description });
  const { pay_as_you_go_min_payment } = await getServerSettings();
  if (!amount || amount < pay_as_you_go_min_payment) {
    throw Error(
      `Amount must be at least ${currency(
        pay_as_you_go_min_payment,
      )}, but it is ${currency(amount)}`,
    );
  }
  if (!description?.trim()) {
    throw Error("description must be nontrivial");
  }
  if (!(await isValidAccount(account_id))) {
    throw Error("account must be valid");
  }
  const stripe = await getConn();
  const customer = await getStripeCustomerId({ account_id, create: true });
  if (customer == null) throw Error("bug");
  logger.debug("createInvoice", { customer });
  const invoice = await stripe.invoices.create({
    customer,
    auto_advance: true,
    collection_method: "send_invoice",
    days_until_due: 21,
    metadata: { account_id, service: "credit" },
    automatic_tax: { enabled: true },
  });
  await stripe.invoiceItems.create({
    invoice: invoice.id,
    customer,
    amount: decimalToStripe(amount), // stripe uses pennies not dollars.
    currency: "usd",
    description,
  });
  logger.debug("createInvoice", { invoice });
  const sentInvoice = await stripe.invoices.sendInvoice(invoice.id);
  return sentInvoice as any;
}

export async function getStripeCustomerId({
  account_id,
  create,
}: {
  account_id: string;
  create: boolean;
}): Promise<string | null> {
  const db = getPool();
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
    return null;
  }
}

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

/*
Invoice is any stripe invoice that somehow got paid.
We check if there is a corresponding credit in the
purchases table, and if not we create the credit
corresponding to this invoice in some cases.

- if invoice.metadata == {account_id, service:'credit'} which indicates this
  invoice was for adding credit to the user's purchases balance.
- if invoice?.lines?.data?.[0]?.metadata == {account_id, service:'credit'} then
  this is from a usage subscription, which exists to regularly add credit
  to the account so that the user can pay subscriptions, etc.
*/
async function paymentAlreadyProcessed(id: string): Promise<boolean> {
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT COUNT(*) AS count FROM purchases WHERE invoice_id=$1",
    [id],
  );
  return rows[0].count > 0;
}

export async function createCreditFromPaidStripeInvoice(
  invoice,
): Promise<boolean> {
  if (await paymentAlreadyProcessed(invoice?.id)) {
    logger.debug(
      "createCreditFromPaidStripeInvoice -- skipping since invoice already processed.",
      invoice?.id,
    );
    return false;
  }
  if (!invoice?.paid) {
    logger.debug(
      "createCreditFromPaidStripeInvoice -- skipping since invoice not yet paid.",
      invoice?.id,
    );
    return false;
  }
  let metadata = invoice?.metadata;
  if (metadata?.purpose) {
    // handled elsewhere (via polling)
    return false;
  }
  if (
    metadata == null ||
    metadata.service != "credit" ||
    !metadata.account_id
  ) {
    metadata = invoice?.lines?.data?.[0]?.metadata;
    if (
      metadata == null ||
      metadata.service != "credit" ||
      !metadata.account_id
    ) {
      logger.debug(
        "createCreditFromPaidStripeInvoice -- skipping since not a service credit",
        invoice.id,
      );
      // Some other sort of invoice, e.g, for a subscription or something else.
      // We don't handle them here.
      return false;
    }
  }
  logger.debug("createCreditFromPaidStripeInvoice -- metadata=", metadata);
  const { account_id } = metadata;
  if (!(await isValidAccount(account_id))) {
    logger.debug(
      "createCreditFromPaidStripeInvoice -- invalid account_id!",
      account_id,
    );
    // definitely should never happen
    throw Error(`invalid account_id in metadata '${account_id}'`);
  }

  let amount;
  if (invoice.currency == "usd") {
    // See comment about "total_excluding_tax" below.
    amount = stripeToDecimal(invoice.total_excluding_tax);
  } else {
    /*
    The currency is not usd so we can't just read off total_excluding_tax, since it will be horribly wrong.
    Instead we figure out how much the invoice was *supposed* to collect from the user in USD, and record
    that amount, which should be very close to what we should get.

    > invoice.data.object.lines.data[0].price.unit_amount
    250
    > invoice.data.object.lines.data[0].quantity
    1
    > invoice.data.object.lines.data[0].price.currency
    'usd'

    NOTE: there's a stripe checkout completion event that also has currency conversion information,
    but that is only created when doing manual checkout, but not for automatic charges, and we need
    to handle both.
    */
    amount = 0;
    for (const line of invoice.lines.data) {
      if (line.price.currency != "usd") {
        throw Error("cannot process this invoice since unknown currency");
      }
      // This is the amount we are trying to charge the user before any taxes or currency conversion:
      amount += stripeToDecimal(line.quantity * line.price.unit_amount);
    }
  }
  if (!amount) {
    logger.debug("createCreditFromPaidStripeInvoice -- 0 amount so skipping");
    return false;
  }
  await createCredit({
    account_id,
    invoice_id: invoice.id,
    amount,
  });

  const { token } = metadata;
  if (token) {
    await markTokenActionPaid(token);
  }

  return true;
}

// This is ONLY used for legacy credit cards
export async function createCreditFromPaidStripePaymentIntent(intent) {
  /*
intent = {
  id: "pi_3NYzMyGbwvoRbeYx1a6eRYqf",
  object: "payment_intent",
  amount: 150,
  amount_details: [Object],
  amount_received: 150,
  customer: "cus_O7MigbqoiPZQUT",
  description: "Credit CoCalc Account",
  metadata: {...},
  status: "succeeded",
  // ...
};
*/
  if (await paymentAlreadyProcessed(intent?.id)) {
    logger.debug(
      "createCreditFromPaidStripePaymentIntent -- skipping since intent already processed.",
      intent?.id,
    );
    return;
  }

  if (intent?.status != "succeeded") {
    logger.debug(
      "createCreditFromPaidStripePaymentIntent -- skipping since status not 'succeeded'",
      intent?.id,
    );
    return;
  }

  let metadata = intent.metadata;
  if (
    metadata == null ||
    metadata.service != "credit" ||
    metadata.purpose ||
    !metadata.account_id
  ) {
    // Some other sort of intent, e.g, for a subscription or something else.
    // We don't handle them here.
    return;
  }

  const { account_id } = metadata;
  if (!(await isValidAccount(account_id))) {
    logger.debug(
      "createCreditFromPaidStripePaymentIntent -- invalid account_id!",
      account_id,
    );
    // definitely should never happen
    throw Error(`invalid account_id in metadata '${account_id}'`);
  }

  // See comment about "total_excluding_tax" below.
  const amount = stripeToDecimal(intent.amount_received);
  if (!amount) {
    logger.debug(
      "createCreditFromPaidStripePaymentIntent -- 0 amount so skipping",
    );
    return;
  }
  await createCredit({
    account_id,
    invoice_id: intent.id,
    amount,
  });
}

/*
NOTE: we collect sales tax when the user makes their initial deposit.  We do NOT add sales tax
onto any purchase in the purchases table.  We only ever mention sales tax in the context
of crediting one's account. This is much simpler.  Here's GPT-4's take, which seems pretty
convincing:

Q: @chatgpt4 I'm creating a website where people can enter a credit card then pay a certain amount of money for credits toward cloud computing resources.  E.g., a person might type in that they want to be charged \$20 and when they are charged, they then have \$20 that they can use for cloud computing via my website, possibly over the next few months or years.    I'm in WA state and the customer is in WA state, so there is an 8% sales tax \(say\).   When should I collect sales tax?  At the point in time when they make the \$20 purchase?   \(So they pay \$20 \+ 8% tax.\)  Or, should I explicitly add sales tax each month when reducing their balance to pay for the resources they actually used?   Any suggestions?

A: Here are the pros and cons of each approach:

**Approach 1: Collect sales tax when the customer makes the $20 purchase**

Pros:

1. Easy to calculate and implement: Tax is applied during the initial transaction, avoiding complex calculations during consumption.
2. Ensures tax collection: Tax is collected upfront, so there is no risk of not receiving tax for unused credits.
3. Simplifies accounting and compliance: Taxes are straightforward to account for and report since they are tied to specific transactions.

Cons:

1. Over-collection risk: If customers use less credit for services subject to sales tax than initially planned, this method may over-collect tax.
2. Refunds: If you offer refunds for unused credit, you may need to adjust and refund the sales tax portion accordingly.

**Approach 2: Add sales tax when reducing balance as resources are used**

Pros:

1. Accurate tax collection: This method applies tax only when the customer uses taxable resources, ensuring a more accurate application of sales tax.
2. Alignment with actual usage: Customers with partially used or unused credits will only be taxed on the resources they actually consumed.

Cons:

1. Complexity: Requires tracking and applying taxes for each resource consumption event, which can be challenging to manage.
2. Compliance risk: Tax may not get collected if the platform encounters errors or lapses in reducing balances, or resource consumption is not accurately tracked.
3. Potential confusion: Customers may find it easier to understand a one-time tax charge during the initial transaction rather than recurring, usage-based tax charges. They might be unclear about when and why sales tax is being deducted.

Ultimately, you should consult a tax professional to understand which approach is the most appropriate and compliant with your specific situation and the laws governing sales tax in your jurisdiction.
*/
