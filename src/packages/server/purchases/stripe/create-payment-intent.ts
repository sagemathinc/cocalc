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

const logger = getLogger("purchases:stripe:create-payment-intent");

export default async function createPaymentIntent({
  account_id,
  purpose,
  description,
  lineItems,
  return_url,
  metadata,
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
}): Promise<{ payment_intent: string; hosted_invoice_url: string }> {
  logger.debug("createPaymentIntent", {
    account_id,
    purpose,
    description,
    lineItems,
    return_url,
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

  await sanityCheckAmount(grandTotal(lineItemsWithoutCredit));

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

  let invoice = await stripe.invoices.create({
    customer,
    auto_advance: false,
    description,
    metadata,
//    automatic_tax: { enabled: true },
    currency: "usd",
  });
  for (const { amount, description } of lineItemsWithoutCredit) {
    await stripe.invoiceItems.create({
      customer,
      amount: decimalToStripe(amount),
      currency: "usd",
      description,
      invoice: invoice.id,
    });
  }

  const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id, {
    auto_advance: false,
  });

  const paymentIntentId = finalizedInvoice.payment_intent as string | undefined;
  if (!paymentIntentId) {
    throw Error("payment intent should have been created but wasn't");
  }

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
  } catch (_err) {
    logger.debug("attempt to use default payment method failed");

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
