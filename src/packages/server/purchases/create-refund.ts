/*
Create a refund.
*/

import getLogger from "@cocalc/backend/logger";
import getPool, { getTransactionClient } from "@cocalc/database/pool";
import getEmailAddress from "@cocalc/server/accounts/get-email-address";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import { Message } from "@cocalc/server/email/message";
import sendEmail from "@cocalc/server/email/send-email";
import { getServerSettings } from "@cocalc/server/settings";
import getConn from "@cocalc/server/stripe/connection";
import type { Reason, Refund } from "@cocalc/util/db-schema/purchases";
import { currency } from "@cocalc/util/misc";
import createPurchase from "./create-purchase";

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
  const {
    invoice_id,
    service,
    cost,
    account_id: customer_account_id,
  } = purchases[0];
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
      account_id: customer_account_id,
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
    // send an email
    try {
      const to = await getEmailAddress(customer_account_id);
      if (to) {
        const { help_email: from, site_name: siteName } =
          await getServerSettings();
        const subject = `${siteName} Refund of Transaction ${purchase_id} for ${currency(
          Math.abs(cost)
        )} + tax`;
        const html = `${siteName} has refunded your credit of ${currency(
          Math.abs(cost)
        )} + tax from transaction ${purchase_id}.
        This refund will appear immediately in your ${siteName} account,
        and should post on your credit card or bank statement within 5-10 days.

        <hr/>

        <br/><br/>
        REASON: ${reason}

        <br/><br/>
        NOTES: ${notes}`;
        const mesg: Message = {
          from,
          to,
          subject,
          html,
          text: html,
          channel: "custom",
        };
        await sendEmail({ message: mesg });
      }
    } catch (err) {
      logger.debug("WARNING -- issue sending email", err);
    }

    return id;
  } catch (err) {
    logger.debug("error creating refund", { account_id, invoice_id }, err);
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
