/*
Create a refund.
*/

import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import getLogger from "@cocalc/backend/logger";
import getConn from "@cocalc/server/stripe/connection";
import getPool, { getTransactionClient } from "@cocalc/database/pool";
import createPurchase from "./create-purchase";
import type { Reason, Refund } from "@cocalc/util/db-schema/purchases";

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
      `reason must be one of "duplicate", "fraudulent", "requested_by_customer" or "other"`
    );
  }

  logger.debug("get the purchase");
  const pool = getPool();
  const { rows: purchases } = await pool.query(
    "SELECT account_id, invoice_id, service, cost FROM purchases WHERE id=$1",
    [purchase_id]
  );
  if (purchases.length == 0) {
    throw Error(`no purchase with id ${purchase_id}`);
  }
  logger.debug("got ", purchases);
  const { invoice_id, service, cost } = purchases[0];
  if (service != "credit") {
    throw Error(
      `only credits can be refunded, but this purchase is of service type '${service}'`
    );
  }
  if (!invoice_id) {
    throw Error("only credits with an invoice_id can be refunded");
  }

  logger.debug("get the invoice");
  const stripe = await getConn();
  const invoice = await stripe.invoices.retrieve(invoice_id);
  const { charge } = invoice;
  logger.debug("got invoice charge = ", { charge });
  if (!charge || typeof charge != "string") {
    throw Error(
      "corresponding invoice does not have a charge -- i.e., it was not paid in a way that we can refund."
    );
  }

  const client = await getTransactionClient();
  try {
    const description = {
      type: "refund",
      purchase_id,
      notes,
      reason,
    } as Refund;
    const id = await createPurchase({
      account_id: purchases[0].account_id,
      service: "refund",
      cost: -cost,
      description,
      client,
    });
    const refund = await stripe.refunds.create({
      charge,
      metadata: { account_id, purchase_id, notes } as any,
      reason: reason != "other" ? reason : undefined,
    });
    await client.query("COMMIT");
    // put actual information about refund id in the database.
    // It's fine doing this after the commit, since the refund.id
    // is not ever used; it just seems like a good idea to include
    // for our records, but we only know it *after* calling stripe.
    description.refund_id = refund.id;
    await client.query("UPDATE purchases SET description=$2 WHERE id=$1", [
      id,
      description,
    ]);
    return id;
  } catch (err) {
    logger.debug("error creating refund", { account_id, invoice_id }, err);
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
