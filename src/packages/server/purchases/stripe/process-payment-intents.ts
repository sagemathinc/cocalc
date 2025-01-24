import getConn from "@cocalc/server/stripe/connection";
import { getStripeCustomerId, getAccountIdFromStripeCustomerId } from "./util";
import getLogger from "@cocalc/backend/logger";
import createCredit from "@cocalc/server/purchases/create-credit";
import { LineItem } from "@cocalc/util/stripe/types";
import { stripeToDecimal } from "@cocalc/util/stripe/calc";
import {
  shoppingCartCheckout,
  shoppingCartPutItemsBack,
} from "@cocalc/server/purchases/shopping-cart-checkout";
import studentPay from "@cocalc/server/purchases/student-pay";
import {
  AUTO_CREDIT,
  SHOPPING_CART_CHECKOUT,
  STUDENT_PAY,
  SUBSCRIPTION_RENEWAL,
  RESUME_SUBSCRIPTION,
} from "@cocalc/util/db-schema/purchases";
import {
  processSubscriptionRenewal,
  processSubscriptionRenewalFailure,
  processResumeSubscription,
  processResumeSubscriptionFailure,
} from "./create-subscription-payment";
import send, { support, url, name } from "@cocalc/server/messages/send";
import adminAlert from "@cocalc/server/messages/admin-alert";
import { currency, round2down } from "@cocalc/util/misc";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import getBalance from "@cocalc/server/purchases/get-balance";
import getPool from "@cocalc/database/pool";
import { recordPaymentIntent } from "./create-payment-intent";

const logger = getLogger("purchases:stripe:process-payment-intents");

export default async function processPaymentIntents({
  paymentIntents,
  account_id,
}: {
  account_id?: string;
  paymentIntents?;
}): Promise<number> {
  if (paymentIntents == null) {
    if (account_id == null) {
      // nothing to do
      return 0;
    }
    const customer = await getStripeCustomerId({ account_id, create: false });
    if (!customer) {
      return 0;
    }

    const stripe = await getConn();

    // all recent ones for this customer
    const recentPaymentIntents = await stripe.paymentIntents.list({ customer });

    // older ones that might have been missed:  this WILL miss newest from above due to time to update the stripe query index!
    // get payment intents with the new purpose metadata field set,
    // which are successful, and which have not been processed.
    // note that the index is slow to update, so we do not filter on status:"succeeded"
    // here, and instead do that in the loop below.
    const query = `customer:"${customer}" AND status:"succeeded" AND -metadata["processed"]:"true" -metadata["purpose"]:null`;
    const olderPaymentIntents = await stripe.paymentIntents.search({
      query,
      limit: 100,
    });
    paymentIntents = recentPaymentIntents.data.concat(olderPaymentIntents.data);
  }
  logger.debug(
    `processing ${paymentIntents.length} payment intents`,
    account_id != null ? `for account_id=${account_id}` : "",
  );

  const seen = new Set<string>();
  const purchase_ids = new Set<number>([]);
  for (const paymentIntent of paymentIntents) {
    if (seen.has(paymentIntent.id)) {
      continue;
    }
    seen.add(paymentIntent.id);
    if (needsToBeRecorded(paymentIntent)) {
      try {
        await recordPaymentIntent({
          paymentIntentId: paymentIntent.id,
          purpose: paymentIntent.metadata.purpose,
          account_id: paymentIntent.metadata.account_id,
          metadata: paymentIntent.metadata,
        });
        await setMetadataRecorded(paymentIntent);
      } catch (err) {
        logger.debug(
          `WARNING: issue processing a payment intent ${paymentIntent.id} -- ${err}`,
        );
      }
    }
    if (isReadyToProcess(paymentIntent)) {
      try {
        const id = await processPaymentIntent(paymentIntent);
        if (id) {
          purchase_ids.add(id);
        }
      } catch (err) {
        // There are a number of things that are expected to go wrong, hopefully ephemeral.  We log
        // them.  Examples:
        //   - Problem creating an item a user wants to buy because they spend too much right when
        //     the purchase is happening. Result: they have their credit and try to do the purchase
        //     again and get their thing.
        //   - The line "await stripe.invoices.retrieve(paymentIntent.invoice);" below fails, since
        //     invoice isn't actually quite created.  It will be the next time we try in a minute.
        logger.debug(
          `WARNING: issue processing a payment intent ${paymentIntent.id} -- ${err}`,
        );
      }
    }
  }
  return purchase_ids.size;
}

export function isReadyToProcess(paymentIntent) {
  // Ready to process if it is in either of the FINAL states, which are
  // succeeded or canceled.  https://docs.stripe.com/payments/paymentintents/lifecycle
  return (
    (paymentIntent.status == "succeeded" ||
      paymentIntent.status == "canceled") &&
    paymentIntent.metadata["processed"] != "true" &&
    paymentIntent.metadata["purpose"] &&
    paymentIntent.metadata["deleted"] != "true" &&
    paymentIntent.invoice
  );
}

// Is this a payment intent coming from a stripe checkout session that we haven't
// yet recorded its impacted?   paymentIntent.invoice being null means it's stripe
// checkout since we make our non-checkout payment intents from an invoice.
function needsToBeRecorded(paymentIntent) {
  return (
    !isReadyToProcess(paymentIntent) &&
    !paymentIntent.invoice &&
    paymentIntent.metadata["purpose"] &&
    paymentIntent.metadata["recorded"] != "true" &&
    paymentIntent.metadata["deleted"] != "true"
  );
}

async function setMetadataRecorded(paymentIntent) {
  const stripe = await getConn();
  paymentIntent.metadata.recorded = "true";
  await stripe.paymentIntents.update(paymentIntent.id, {
    metadata: paymentIntent.metadata,
  });
}

// NOT a critical assumption.  We do NOT assume processPaymentIntent is never run twice at
// the same time for the same payment, either in the same process or on the cluster.
// If $n$ attempts to run this happen at once, the createCredit call will succeed for
// one of them and fail for all others due to the unique index on the invoice_id field.
// The credit thus gets created at most once, and no items are created except by the
// thread that created the credit.

// reuseInFlight since this function is called pretty aggressively, and we want to avoid calling it twice
// on the same input at the same time.  That doesn't result in a double transaction, but sends multiple
// messages out to the user, which is confusing.
export const processPaymentIntent = reuseInFlight(
  async (paymentIntent): Promise<number | undefined> => {
    if (paymentIntent.metadata.processed == "true") {
      // already done.
      return;
    }
    let account_id = paymentIntent.metadata.account_id;
    logger.debug("processPaymentIntent", { id: paymentIntent.id, account_id });
    if (!account_id) {
      // this should never happen, but in case it does, we lookup the account_id
      // in our database, based on the customer id.
      account_id = await getAccountIdFromStripeCustomerId(
        paymentIntent.customer,
      );
      if (!account_id) {
        // no possible way to process this.
        // This will happen in *test mode* since I use the exact same test credentials with
        // many unrelated cocalc dev servers and they might all try to process the same payments.
        logger.debug(
          "processPaymentIntent: unknown stripe customer",
          paymentIntent.customer,
        );
        adminAlert({
          subject: `Broken payment intent ${paymentIntent.id} that can't be processed - please investigate`,
          body: `
CoCalc was processing the payment intent with id ${paymentIntent.id}, but the metadata didn't have an
account_id set (which should impossible) AND the customer for the paymentIntent isn't a known stripe
customer.  So we don't know what to do with this.  Please manually investigate.
`,
        });
        return;
      }
    }

    const stripe = await getConn();
    // IMPORTANT: There is just no way in general to know directly from the payment intent
    // and invoice exactly what we were trying to charge the customer!  The problem is that
    // the invoice (and line items) in some cases (e.g., stripe checkout) is in a non-US currency.
    // We thus set the metadata to have the total in **US PENNIES** (!). Users can't touch
    // this metadata, and we depend on it for how much the invoice is worth to us.
    const total_excluding_tax_usd =
      paymentIntent.metadata.total_excluding_tax_usd;
    if (total_excluding_tax_usd == null) {
      // cannot be processed further.
      return;
    }
    const amount = stripeToDecimal(parseInt(total_excluding_tax_usd));

    if (paymentIntent.status == "canceled") {
      // This is a payment intent that has definitely failed
      // forever.  In some cases, we also want to do some
      // processing.

      paymentIntent.metadata.processed = "true";
      await stripe.paymentIntents.update(paymentIntent.id, {
        metadata: paymentIntent.metadata,
      });

      let result = "we did NOT add credit to your account";
      try {
        if (paymentIntent.metadata.purpose == SHOPPING_CART_CHECKOUT) {
          result = "the items you were buying were put back in your cart";
          // free up the items so they can be purchased again.
          // The purpose of this payment was to buy certain items from the store.  We use the credit we just got above
          // to provision each of those items.
          const cart_ids =
            paymentIntent.metadata.cart_ids != null
              ? JSON.parse(paymentIntent.metadata.cart_ids)
              : undefined;
          if (cart_ids != null) {
            await shoppingCartPutItemsBack({ cart_ids });
          }
        } else if (paymentIntent.metadata.purpose == STUDENT_PAY) {
          // Student pay for a course
          result = `the course (project_id=${paymentIntent.metadata.project_id}) was not paid for`;
          // nothing further to do if it fails, since when student tries again,
          // we query stripe for the payment intent and check that its status is
          // 'canceled'.
        } else if (paymentIntent.metadata.purpose == SUBSCRIPTION_RENEWAL) {
          result = `we did NOT renew subscription (id=${paymentIntent.metadata.subscription_id})`;
          await processSubscriptionRenewalFailure({
            paymentIntent,
          });
        } else if (paymentIntent.metadata.purpose == RESUME_SUBSCRIPTION) {
          result = `we did NOT resume subscription (id=${paymentIntent.metadata.subscription_id})`;
          await processResumeSubscriptionFailure({
            paymentIntent,
          });
        } else if (paymentIntent.metadata.purpose?.startsWith("statement-")) {
          const statement_id = parseInt(
            paymentIntent.metadata.purpose.split("-")[1],
          );
          result = `your monthly statement (id=${statement_id}) is not paid for and you may still owe money`;
        }
        send({
          to_ids: [account_id],
          subject: `Canceled ${currency(amount)} Payment`,
          body: `A payment of ${currency(amount)} was canceled, and as a result ${result}.
- Payment id: ${paymentIntent.id}

- Your payments: ${await url("settings", "payments")}

- Account Balance: ${currency(round2down(await getBalance({ account_id })))}

${await support()}`,
        });
        const n = await name(account_id);
        adminAlert({
          subject: `User's Payment (paymentIntent = ${paymentIntent.id}) was canceled`,
          body: `
The user ${await name(account_id)} with account_id=${account_id} had a canceled payment intent. We told them
the consequence is "${result}".  Admins might want to investigate.

- User: ${n}, account_id=${account_id}


`,
        });
      } catch (err) {
        // There basically should never be a case where any of the above fails... but reality.
        // So communicate this.
        const body = `You canceled a payment of ${currency(amount)}, so ${result}.  However, cleaning up this resulted in an error.  You may need to contact support.

- Account Balance: ${currency(round2down(await getBalance({ account_id })))}

- ERROR: ${err}

${await support()}`;
        send({
          to_ids: [account_id],
          subject: `Possible Issue Processing Canceled ${currency(amount)} Payment`,
          body,
        });
        adminAlert({
          subject: "Issue Processing a Canceled Payment",
          body: `There was an error processing the cancelation of a payment intent with id ${paymentIntent.id} for the user with account_id=${account_id}.  An admin might want to look into this, since this sort of error should never happen.

## Message sent to user: ${body}`,
        });
        throw err;
      }

      return;
    }

    const invoice = await stripe.invoices.retrieve(paymentIntent.invoice);

    // credit the account.  If the account was already credited for this (e.g.,
    // by another process doing this at the same time), that should be detected
    // and is a no-op, due to the invoice_id being unique amount purchases records
    // for this account (MAKE SURE!).
    const credit_id = await createCredit({
      account_id,
      invoice_id: paymentIntent.id,
      amount,
      description: {
        line_items: getInvoiceLineItems(invoice),
        description: paymentIntent.description,
        purpose: paymentIntent.metadata.purpose,
      },
      service:
        paymentIntent.metadata.purpose == AUTO_CREDIT
          ? "auto-credit"
          : "credit",
    });

    // make metadata so we won't consider this payment intent ever again
    // NOTE: we are mutating this on purpose so that the paymentIntent
    // that gets returned, e.g., by getPayments is already up to date with the credit_id!
    paymentIntent.metadata.processed = "true";
    paymentIntent.metadata.credit_id = credit_id;
    await stripe.paymentIntents.update(paymentIntent.id, {
      metadata: paymentIntent.metadata,
    });

    let reason = "add credit to your account";
    try {
      if (paymentIntent.metadata.purpose == SHOPPING_CART_CHECKOUT) {
        reason = "purchase items in your shopping cart";
        // The purpose of this payment was to buy certain items from the store.
        // We use the credit we just got above to provision each of those items.
        await shoppingCartCheckout({
          account_id,
          payment_intent: paymentIntent.id,
          amount,
          credit_id,
          cart_ids:
            paymentIntent.metadata.cart_ids != null
              ? JSON.parse(paymentIntent.metadata.cart_ids)
              : undefined,
        });
      } else if (paymentIntent.metadata.purpose == STUDENT_PAY) {
        reason = `pay for a course (project_id=${paymentIntent.metadata.project_id})`;
        // Student pay for a course
        await studentPay({
          account_id,
          project_id: paymentIntent.metadata.project_id,
          amount,
          credit_id,
        });
      } else if (paymentIntent.metadata.purpose == SUBSCRIPTION_RENEWAL) {
        reason = `renew a subscription (id=${paymentIntent.metadata.subscription_id})`;
        await processSubscriptionRenewal({ account_id, paymentIntent, amount });
      } else if (paymentIntent.metadata.purpose == RESUME_SUBSCRIPTION) {
        reason = `resume a subscription (id=${paymentIntent.metadata.subscription_id})`;
        await processResumeSubscription({ account_id, paymentIntent, amount });
      } else if (paymentIntent.metadata.purpose?.startsWith("statement-")) {
        const statement_id = parseInt(
          paymentIntent.metadata.purpose.split("-")[1],
        );
        reason = `pay balance on monthly statement (id=${statement_id})`;
        const pool = getPool();
        await pool.query(
          "UPDATE statements SET paid_purchase_id=$1 WHERE id=$2",
          [credit_id, statement_id],
        );
      }
      send({
        to_ids: [account_id],
        subject: `You Made a ${currency(amount)} Payment (Credit id: ${credit_id})`,
        body: `
You successfully made a payment of ${currency(amount)}, which was used to ${reason}.
Thank you!

- Payment id: ${paymentIntent.id}

- Purchase credit id: ${credit_id}

- Browser all your [Payments](${await url("settings", "payments")}) and [Purchases](${await url("settings", "purchases")})

- Account Balance: ${currency(round2down(await getBalance({ account_id })))}

${await support()}`,
      });
    } catch (err) {
      // There basically should never be a case where any of the above fails.  But multiple
      // transactions happening at once, or bugs, etc. could maybe lead to a case where
      // cocalc refuses to fully process the transaction.  Communicate this.
      const body = `
You made a payment of ${currency(amount)}, which has been successfully processed by our
payment processor, and a credit of ${currency(amount)} has been added to your
account (purchase id=${credit_id}).   You made this payment to ${reason}, but something
went wrong.

Please retry that purchase instead using the credit that is now on your account, or contact
support if you are concerned (see below).

- Account Balance: ${currency(round2down(await getBalance({ account_id })))}

- Your payments: ${await url("settings", "payments")}

- ERROR: ${err}

${await support()}
`;
      send({
        to_ids: [account_id],
        subject: `Possible Issue Processing ${currency(amount)} Payment`,
        body,
      });
      adminAlert({
        subject: "Issue Processing a User Payment",
        body: `There was an error processing payment intent id ${paymentIntent.id} for the user with account_id=${account_id}.\n\n## Message sent to user:\n\n${body}`,
      });
      throw err;
    }

    return credit_id;
  },
);

// This allows for a periodic check that we have processed all recent payment
// intents across all users.  It should be called periodically.
// This should be called periodically as a maintenance task.
export async function processAllRecentPaymentIntents(): Promise<number> {
  const stripe = await getConn();

  // payments that might have been missed. This might miss something from up to 1-2 minutes ago
  // due to time to update the index, but that is fine given the point of this function.
  // We also use a small limit, since in almost all cases this will be empty, and if it is
  // not empty, we would just call it again to get more results.
  const query = `status:"succeeded" AND -metadata["processed"]:"true" AND -metadata["purpose"]:null`;
  const paymentIntents = await stripe.paymentIntents.search({
    query,
    limit: 10,
  });
  logger.debug(
    `processAllRecentPaymentIntents: considering ${paymentIntents.data.length} payments...`,
  );
  const purchase_ids = new Set<number>([]);
  for (const paymentIntent of paymentIntents.data) {
    if (isReadyToProcess(paymentIntent)) {
      const id = await processPaymentIntent(paymentIntent);
      if (id) {
        purchase_ids.add(id);
      }
    }
  }
  return purchase_ids.size;
}

export async function maintainPaymentIntents() {
  logger.debug("maintainPaymentIntents");
  // Right now we just call this. We could put in a longer interval between
  // calls (i.e. refuse to call too frequently if necessary).  Right now
  // this gets called every 5 minutes, which seems fine.
  await processAllRecentPaymentIntents();
}

function getInvoiceLineItems(invoice): LineItem[] {
  const data = invoice.lines?.data;
  if (data == null) {
    return [];
  }
  const v: LineItem[] = data.map(({ description, amount }) => {
    return { description: description ?? "", amount: stripeToDecimal(amount) };
  });
  if (invoice.tax) {
    v.push({
      description: "Tax",
      amount: stripeToDecimal(invoice.tax),
      tax: true,
    });
  }
  return v;
}
