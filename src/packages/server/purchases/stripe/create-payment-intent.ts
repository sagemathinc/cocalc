import getConn from "@cocalc/server/stripe/connection";
import getLogger from "@cocalc/backend/logger";
import {
  defaultReturnUrl,
  getStripeCustomerId,
  sanityCheckAmount,
  assertValidUserMetadata,
  getStripeLineItems,
} from "./util";
import type {
  LineItem,
  PaymentIntentCancelReason,
} from "@cocalc/util/stripe/types";
import {
  isReadyToProcess,
  processPaymentIntent,
} from "./process-payment-intents";
import { decimalToStripe, grandTotal } from "@cocalc/util/stripe/calc";
import {
  SHOPPING_CART_CHECKOUT,
  STUDENT_PAY,
  RESUME_SUBSCRIPTION,
} from "@cocalc/util/db-schema/purchases";
import setShoppingCartPaymentIntent from "@cocalc/server/shopping/cart/payment-intent";
import {
  studentPaySetPaymentIntent,
  studentPayAssertNotPaying,
} from "@cocalc/server/purchases/student-pay";
import { resumeSubscriptionSetPaymentIntent } from "./create-subscription-payment";
import send, { name, support, url } from "@cocalc/server/messages/send";
import { delay } from "awaiting";

const logger = getLogger("purchases:stripe:create-payment-intent");

export default async function createPaymentIntent({
  account_id,
  purpose,
  description,
  lineItems,
  return_url,
  metadata,
  force,
}: {
  account_id: string;
  purpose: string;
  // arbitrary string to show to the user
  description?: string;
  lineItems: LineItem[];
  return_url?: string;
  // optional extra metadata: do NOT use 'purpose', 'account_id', 'confirm' or 'processed'.
  // as a key.
  metadata?: { [key: string]: string };
  // Returns a finalized invoice object -- https://docs.stripe.com/api/invoices/object

  // do not bother with sanity checking the amount, e.g., it can be below the
  // min payg setting.
  force?: boolean;
}): Promise<{ payment_intent: string; hosted_invoice_url: string }> {
  logger.debug("createPaymentIntent", {
    account_id,
    purpose,
    description,
    lineItems,
    return_url,
    force,
  });
  if (!purpose) {
    throw Error("purpose must be set");
  }
  assertValidUserMetadata(metadata);

  if (purpose == STUDENT_PAY) {
    // check some conditions
    const project_id = metadata?.project_id;
    await studentPayAssertNotPaying({ project_id });
  }

  const { lineItemsWithoutCredit, total_excluding_tax_usd } =
    getStripeLineItems(lineItems);

  logger.debug("createPaymentIntent -- ", {
    lineItemsWithoutCredit,
    total_excluding_tax_usd,
  });

  if (!force) {
    await sanityCheckAmount(grandTotal(lineItemsWithoutCredit));
  }

  const stripe = await getConn();
  const customer = await getStripeCustomerId({ account_id, create: true });
  if (!customer) {
    throw Error("bug");
  }

  logger.debug("createPaymentIntent -- create invoice:", { customer });

  metadata = {
    ...metadata,
    purpose,
    account_id,
    confirm: "true",
    total_excluding_tax_usd: `${total_excluding_tax_usd}`,
  };

  if (!return_url) {
    return_url = await defaultReturnUrl();
  }

  let invoice;
  const invoiceCreateParams = {
    customer,
    auto_advance: false,
    description,
    metadata,
    currency: "usd",
  };

  const addLineItems = async (invoice) => {
    for (const { amount, description } of lineItemsWithoutCredit) {
      logger.debug("creating and add invoice item", {
        customer,
        amount: decimalToStripe(amount),
        currency: "usd",
        description,
        invoice: invoice.id,
      });
      await stripe.invoiceItems.create({
        customer,
        amount: decimalToStripe(amount),
        currency: "usd",
        description,
        invoice: invoice.id,
      });
    }
  };

  let finalizedInvoice;
  logger.debug("creating invoice with automatic_tax enabled");
  // try with tax enabled
  invoice = await stripe.invoices.create({
    ...invoiceCreateParams,
    automatic_tax: { enabled: true },
  });
  await addLineItems(invoice);
  try {
    finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id, {
      auto_advance: false,
    });
  } catch (err) {
    logger.debug(`creating invoice with automatic_tax enabled failed: ${err}`);
    logger.debug("creating invoice WITHOUT automatic_tax enabled");
    // failed, so do without tax enabled.  If a user has NO INFO in stripe, then
    // tax will fail.  But there are rare situations where we need to auto generate an
    // invoice, but there is no interactive session with the user, so we fallback
    // here to not using tax in this case.  Once they enter payment information
    // to pay this, next time tax will be properly charged.
    // ALSO we explicitly send them an "ACTION REQUIRED" message asking them to
    // enter their address for tax purposes, and when they do then things will work
    // for all future purposes.  I think it is only likely that old customers would
    // ever get in this situation.
    await stripe.invoices.update(invoice.id, {
      automatic_tax: { enabled: false },
    });
    finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id, {
      auto_advance: false,
    });
    send({
      to_ids: [account_id],
      subject: "ACTION REQUIRED: Enter your address for tax purposes",
      body: `
Dear ${await name(account_id)},

Please visit [Payment Methods](${await url("settings", "payment-methods")}) and enter
your name and address so that for we can correctly charge tax.

${await support()}
      `,
    });
  }

  let paymentIntentId;
  paymentIntentId = finalizedInvoice.payment_intent as string | undefined;
  // Usually paymentIntentId is set, but every so often it isn't, and I have
  // no idea why or what is going on.  The api docs are not helpful:
  //   https://docs.stripe.com/api/invoices/finalize
  // For now at least retry up to 20s with exponential backoff:
  const t0 = Date.now();
  let d = 2000;
  while (!paymentIntentId && Date.now() - t0 <= 30000) {
    logger.debug("finalizing didn't produce payment intent, so checking again");
    await delay(d);
    d *= 1.3 + Math.random();
    finalizedInvoice = await stripe.invoices.retrieve(invoice.id);
  }
  if (!paymentIntentId) {
    throw Error(
      "payment intent should have been created but wasn't, even after waiting 30s",
    );
  }

  await recordPaymentIntent({ purpose, account_id, paymentIntentId, metadata });

  await stripe.paymentIntents.update(paymentIntentId, {
    description,
    metadata,
    // needed so if user pays for the first time we keep their payment method
    setup_future_usage: "off_session",
  });

  let success = false;
  try {
    invoice = await stripe.invoices.pay(finalizedInvoice.id);
    success = true;
  } catch (err) {
    logger.debug(
      `attempt to use default payment method failed (which is fine!): ${err}`,
    );
    logger.debug(
      "instead we check for others or just let user fill something in",
    );

    for (const payment_method of await getPaymentMethods({ customer })) {
      await stripe.invoices.update(invoice.id, {
        default_payment_method: payment_method,
      });
      try {
        invoice = await stripe.invoices.pay(finalizedInvoice.id);
        logger.debug("paying with another method on file worked");
        success = true;
        break;
      } catch (_err) {
        logger.debug("another attempt to use default payment method failed");
      }
    }
  }
  if (!success) {
    return finalizedInvoice as any;
  }
  // succeeded, so immediately check if we can process, in case of an instant
  // payment method.  otherwise, has to wait on user intervention and/or our
  // periodic polling of Stripe, or maybe a webhook.
  const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
  if (isReadyToProcess(paymentIntent)) {
    processPaymentIntent(paymentIntent);
  }
  return finalizedInvoice as any;
}

// returns first ~10 distinct payment method ids, with the default first if there
// is a default.
async function getPaymentMethods({ customer }): Promise<string[]> {
  const stripe = await getConn();
  const paymentMethods: string[] = [];

  const c = await stripe.customers.retrieve(customer);
  const id = (c as any)?.invoice_settings?.default_payment_method;
  if (id) {
    paymentMethods.push(id);
  }

  // no default, so what do they have?
  const { data } = await stripe.customers.listPaymentMethods(customer);
  for (const { id } of data) {
    if (!paymentMethods.includes(id)) {
      paymentMethods.push(id);
    }
  }
  return paymentMethods;
}

// This is meant to be used only by admins
export async function cancelPaymentIntent({
  id,
  reason,
}: {
  id: string;
  reason: PaymentIntentCancelReason;
}) {
  const stripe = await getConn();
  try {
    await stripe.paymentIntents.cancel(id, {
      cancellation_reason: reason as any,
    });
  } catch (err) {
    const e = `${err}`.toLowerCase();
    if (e.includes("checkout") && e.includes("session")) {
      // these cannot be canceled, ever.  so we mark metadata,
      // then filter them out.
      await stripe.paymentIntents.update(id, {
        metadata: { deleted: "true" },
      });
      return;
    }
    if (e.includes("invoice")) {
      // try voiding the invoice instead:
      const paymentIntent = await stripe.paymentIntents.retrieve(id);
      if (typeof paymentIntent.invoice == "string") {
        await stripe.invoices.voidInvoice(paymentIntent.invoice);
        return;
      }
    }
    // I don't know any cases that end up here.
    throw err;
  }
}

export async function getPaymentIntentAccountId(
  id: string,
): Promise<string | undefined> {
  const stripe = await getConn();
  const paymentIntent = await stripe.paymentIntents.retrieve(id);
  return paymentIntent.metadata?.account_id;
}

// When a payment intent is created we change some state in cocalc to
// indicate this, which is critical to avoid double payments.
// This is called right after creating and finalizing a payment intent
// explicitly above, but ALSO a payment intent (with no invoice)
// gets created implicitly as part of the stripe checkout process
// so we call this code when handling payment intents that have no
// invoice.
export async function recordPaymentIntent({
  purpose,
  account_id,
  paymentIntentId,
  metadata,
}) {
  logger.debug("recordPaymentIntent", {
    purpose,
    account_id,
    paymentIntentId,
    metadata,
  });
  if (purpose == SHOPPING_CART_CHECKOUT) {
    try {
      await setShoppingCartPaymentIntent({
        account_id,
        payment_intent: paymentIntentId,
      });
    } catch (err) {
      // This is bad -- we couldn't properly mark what is being bought, but
      // the payment intent exists. This could happen if the database went
      // down.  In this case, we cancel the payment intent (no money has been taken yet!),
      // and do NOT start the payment below!

      // In the highly unlikely case this failed, that would be bad because the
      // payment would be left hanging, but we haven't even tried to charge them,
      // so I think they might have to go out of their way to pay.  They might NOT
      // get their items automatically if they pay, but they would get their credit
      // and could buy them later.  So basically double pay is perhaps still possible,
      // but a user would have to try really, really hard.
      await cancelPaymentIntent({
        id: paymentIntentId,
        reason: "abandoned",
      });

      // the user will get back an error message.  This should happen when cocalc
      // is badly broken.  They can try again, but there's no harm in this case.
      throw err;
    }
    // Now in case of shopping, the items in the cart have been moved to a new state
    // so they can't be bought again, so it's safe to start trying to get the user
    // to pay us, which is what happens next below.
  } else if (purpose == STUDENT_PAY) {
    await studentPaySetPaymentIntent({
      project_id: metadata.project_id,
      paymentIntentId,
    });
  } else if (purpose == RESUME_SUBSCRIPTION) {
    await resumeSubscriptionSetPaymentIntent({
      subscription_id: parseInt(metadata.subscription_id),
      paymentIntentId,
    });
  }
}
