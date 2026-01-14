/*
Create a refund.
*/

import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import getLogger from "@cocalc/backend/logger";
import getConn from "@cocalc/server/stripe/connection";
import getPool, { getTransactionClient } from "@cocalc/database/pool";
import createPurchase from "./create-purchase";
import type { Reason, Refund } from "@cocalc/util/db-schema/purchases";
import { moneyToCurrency, toDecimal } from "@cocalc/util/money";
import send, { support, url } from "@cocalc/server/messages/send";

const logger = getLogger("purchase:create-refund");

export default async function createRefund(opts: {
  account_id: string;
  purchase_id: number;
  reason: Reason;
  notes?: string;
}): Promise<number> {
  logger.debug("createRefund", opts);
  const { account_id } = opts;
  if (!(await userIsInGroup(account_id, "admin"))) {
    throw Error("only admins can create refunds");
  }
  const { purchase_id, reason, notes = "" } = opts;
  if (
    reason != "duplicate" &&
    reason != "fraudulent" &&
    reason != "requested_by_customer" &&
    reason != "other"
  ) {
    // don't trust typescript, since used via api...
    throw Error(
      `Reason must be one of "duplicate", "fraudulent", "requested_by_customer" or "other"`,
    );
  }

  logger.debug("get the purchase");
  const pool = getPool();
  // the fields listed below are the union of what is needed for various types
  // of refunds.  This is a rarely done operation so speed isn't important.
  const { rows: purchases } = await pool.query(
    "SELECT id, account_id, invoice_id, service, cost, description FROM purchases WHERE id=$1",
    [purchase_id],
  );
  if (purchases.length == 0) {
    throw Error(`No purchase with id ${purchase_id}`);
  }
  const { service } = purchases[0];
  logger.debug("got ", purchases);
  if (service == "credit" || service == "auto-credit") {
    return await refundCredit(account_id, reason, notes, purchases[0]);
  }
  throw Error(
    `Only credits can be refunded, but this purchase is of service type '${service}'`,
  );
}

async function refundCredit(
  admin_account_id,
  reason,
  notes,
  {
    id: purchase_id,
    invoice_id,
    cost,
    account_id,
    description: orig_description,
  },
) {
  logger.debug("refundCredit", purchase_id);
  const costValue = toDecimal(cost);
  if (!invoice_id) {
    throw Error("Only credits with an invoice_id can be refunded");
  }
  const stripe = await getConn();

  let paymentIntentId = "";
  if (invoice_id.startsWith("pi_")) {
    paymentIntentId = invoice_id;
    // it's actually a payment intent id (not an invoice_id), so we have to grab that and get the invoice from there.
    const intent = await stripe.paymentIntents.retrieve(invoice_id);
    invoice_id = intent.invoice;
  }

  logger.debug("get the invoice_id", invoice_id);
  const invoice = await stripe.invoices.retrieve(invoice_id);
  const { charge } = invoice;
  logger.debug("got invoice charge = ", { charge });
  if (!charge || typeof charge != "string") {
    throw Error(
      "corresponding invoice does not have a charge -- i.e., it was not paid in a way that we can refund.",
    );
  }

  const client = await getTransactionClient();
  let refund_purchase_id;
  try {
    const description = {
      type: "refund",
      purchase_id,
      notes,
      reason,
    } as Refund;
    refund_purchase_id = await createPurchase({
      account_id,
      service: "refund",
      cost: costValue.neg(),
      description,
      client,
    });
    const refund = await stripe.refunds.create({
      charge,
      metadata: { account_id: admin_account_id, purchase_id, notes } as any,
      reason: reason != "other" ? reason : undefined,
    });

    if (paymentIntentId) {
      await stripe.paymentIntents.update(paymentIntentId, {
        metadata: {
          refund_date: Date.now(),
          refund_reason: reason,
          refund_notes: notes,
        },
      });
    }

    // put actual information about refund id in the database.
    // It's fine doing this after the commit, since the refund.id
    // is not ever used; it just seems like a good idea to include
    // for our records, but we only know it *after* calling stripe.
    await client.query("UPDATE purchases SET description=$2 WHERE id=$1", [
      refund_purchase_id,
      { ...description, refund_id: refund.id },
    ]);
    // we also set new purchase id
    await client.query("UPDATE purchases SET description=$2 WHERE id=$1", [
      purchase_id,
      { ...orig_description, refund_purchase_id },
    ]);

    await client.query("COMMIT");
  } catch (err) {
    logger.debug("error creating refund", { account_id, invoice_id }, err);
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  // send confirmation message
  try {
    const subject = `Refund of Transaction ${purchase_id} for ${moneyToCurrency(
      costValue.abs(),
    )} + tax`;
    const body = `
Your credit of ${moneyToCurrency(
      costValue.abs(),
    )} + tax from transaction ${purchase_id} has been refunded.

This refund will appear immediately in [your account](${await url("settings", "purchases")}),
and should post on your credit card or bank statement within 5-10 days.

---

- REASON: ${reason}

- NOTES: ${notes}

${await support()}
`;
    await send({ to_ids: [account_id], subject, body });
  } catch (err) {
    logger.debug("WARNING -- issue sending email", err);
  }

  return refund_purchase_id;
}
