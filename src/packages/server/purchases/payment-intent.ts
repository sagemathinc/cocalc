import getConn from "@cocalc/server/stripe/connection";
import getLogger from "@cocalc/backend/logger";
import { getStripeCustomerId, sanityCheckAmount } from "./stripe/util";
import type {
  PaymentIntentSecret,
  PaymentIntentCancelReason,
  LineItem,
} from "@cocalc/util/stripe/types";
import base_path from "@cocalc/backend/base-path";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { creditLineItem } from "@cocalc/util/upgrades/describe";
import processPaymentIntents from "./stripe/process-payment-intents";

const logger = getLogger("purchases:payment-intent");

export async function createInvoice({
  account_id,
  purpose,
  amount,
  description,
  lineItems = [],
  confirm,
  return_url,
  metadata,
}: {
  account_id: string;
  purpose: string;
  // amount of money in dollars.
  amount: number;
  // arbitrary string to show to the user
  description?: string;
  lineItems: LineItem[];
  confirm?: boolean;
  return_url?: string;
  // optional extra metadata: do NOT use 'purpose', 'account_id', 'confirm' or 'processed'.
  // as a key.
  metadata?: { [key: string]: string };
}) {
  logger.debug("createInvoice", {
    account_id,
    amount,
    purpose,
    description,
    lineItems,
    return_url,
  });
  if (!purpose) {
    throw Error("purpose must be set");
  }
  if (
    metadata?.purpose != null ||
    metadata?.account_id != null ||
    metadata?.confirm != null ||
    metadata?.processed != null
  ) {
    throw Error(
      "metadata must not include 'purpose', 'account_id', 'confirm' or 'processed' as a key",
    );
  }

  await sanityCheckAmount(amount);

  const stripe = await getConn();
  const customer = await getStripeCustomerId({ account_id, create: true });
  if (!customer) {
    throw Error("bug");
  }

  logger.debug("createInvoice", { customer });

  metadata = {
    ...metadata,
    purpose,
    account_id,
    ...(confirm ? { confirm: "true" } : undefined),
  };

  // TODO: [ ] sanity check lineItems !!

  // TODO: this is just a first attempt to see how this works.
  // create invoice
  const invoice = await stripe.invoices.create({
    customer,
    auto_advance: false,
    description,
    metadata,
    automatic_tax: { enabled: true },
    currency: "usd",
  });
  for (const lineItem of lineItems) {
    const lineItemAmount = Math.ceil(lineItem.amount * 100);
    await stripe.invoiceItems.create({
      customer,
      amount: lineItemAmount,
      currency: "usd",
      description: lineItem.description,
      invoice: invoice.id,
    });
  }
  const { credit } = creditLineItem({ lineItems, amount });
  if (credit) {
    // add one more line item to make the grand total be equal to amount
    await stripe.invoiceItems.create({
      description: credit.description,
      amount: Math.ceil(amount * 100),
      customer,
      currency: "usd",
      invoice: invoice.id,
    });
  }
  const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id, {
    auto_advance: false,
  });
  // as because again stripe typings are wrong (?)
  const payment_intent = finalizedInvoice.payment_intent as string | undefined;
  if (!payment_intent) {
    throw Error("payment intent should have been created but wasn't");
  }
  await stripe.paymentIntents.update(payment_intent, {
    description,
    metadata,
  });
  if (confirm) {
    return await stripe.invoices.pay(finalizedInvoice.id);
  }
  return finalizedInvoice;
}

// create a new or modify the unfinished payment into
// with the given purpose.   If called again with the
// same purpose, but other parameters, then updates the
// existing one.

export async function createPaymentIntent({
  account_id,
  purpose,
  amount,
  description,
  lineItems,
  confirm,
  return_url,
  metadata,
}: {
  // user created the payment intent -- assumed already authenticated/valid
  account_id: string;
  purpose: string;
  // amount of money in dollars.
  amount: number;
  // arbitrary string to show to the user
  description?: string;
  // if given, first generate an invoice with these line items.
  // NOTE: the amount charged is always specified by the amount input.
  // We list each item here and if the total is different than amount, then
  // we add another line item to adjust it.
  lineItems?: LineItem[];
  confirm?: boolean;
  return_url?: string;
  // optional extra metadata: do NOT use 'purpose', 'account_id', 'confirm' or 'processed'.
  // as a key.
  metadata?: { [key: string]: string };
}): Promise<PaymentIntentSecret> {
  logger.debug("createPaymentIntent", {
    account_id,
    amount,
    purpose,
    description,
    lineItems,
    return_url,
  });
  if (!purpose) {
    throw Error("purpose must be set");
  }
  if (
    metadata?.purpose != null ||
    metadata?.account_id != null ||
    metadata?.confirm != null ||
    metadata?.processed != null
  ) {
    throw Error(
      "metadata must not include 'purpose', 'account_id', 'confirm' or 'processed' as a key",
    );
  }

  await sanityCheckAmount(amount);

  const amountStripe = Math.ceil(amount * 100);
  const stripe = await getConn();
  const customer = await getStripeCustomerId({ account_id, create: true });
  if (!customer) {
    throw Error("bug");
  }

  logger.debug("createPaymentIntent", { customer });

  const customerSession = confirm
    ? undefined
    : await stripe.customerSessions.create({
        customer,
        components: {
          payment_element: {
            enabled: true,
            features: {
              payment_method_redisplay: "enabled",
              payment_method_remove: "enabled",
            },
          },
        },
      });

  let paymentIntent;
  metadata = {
    ...metadata,
    purpose,
    account_id,
    ...(confirm ? { confirm: "true" } : undefined),
  };

  const intent = await getOpenPaymentIntent({ customer, purpose, confirm });
  if (intent != null) {
    paymentIntent = intent;
    await stripe.paymentIntents.update(paymentIntent.id, {
      amount: amountStripe,
      description,
      metadata,
    });
  } else {
    let success = false;
    if (confirm) {
      if (!return_url) {
        const { dns } = await getServerSettings();
        return_url = `https://${dns}${base_path}`;
      }
      let id = "";
      // attempt to pay immediately using an available payment method.
      for (const payment_method of await getPaymentMethods({ customer })) {
        try {
          if (id) {
            paymentIntent = await stripe.paymentIntents.confirm(id, {
              payment_method,
              return_url,
            });
          } else {
            paymentIntent = await stripe.paymentIntents.create({
              customer,
              amount: amountStripe,
              description,
              currency: "usd",
              metadata,
              setup_future_usage: "off_session",
              confirm,
              return_url,
              payment_method,
            });
          }
          success = true;
          // it worked -- if it finished, add money to the user's purchases log in our database.
          // It may have worked but still require more steps by the user.
          await processPaymentIntents({ account_id });
          break;
        } catch (err) {
          logger.debug("createPaymentIntent -- confirm: ", err.raw.message);
          // save the id so we can use it in the loop above for the other attempts
          id = err.raw.payment_intent.id;
        }
      }
      if (!success && id) {
        paymentIntent = await stripe.paymentIntents.retrieve(id);
        success = true;
      }
    }
    if (!success) {
      // create the payment intent - we will directly bug the user to pay
      // this in other ways, since they have nothing setup that can provide
      // an automatic payment.
      paymentIntent = await stripe.paymentIntents.create({
        customer,
        amount: amountStripe,
        description,
        currency: "usd",
        metadata,
        setup_future_usage: "off_session",
      });
    }
  }

  return {
    clientSecret: paymentIntent.client_secret!,
    customerSessionClientSecret: customerSession?.client_secret,
  };
}

// returns first ~10 distinct payment method ids, with the default first if there
// is a default.
export async function getPaymentMethods({ customer }): Promise<string[]> {
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

export async function hasPaymentMethod(account_id: string) {
  const customer = await getStripeCustomerId({ account_id, create: true });
  return (await getPaymentMethods({ customer })).length > 0;
}

function isOpenPaymentIntent(intent) {
  if (
    intent.metadata.confirm &&
    intent.status != "succeeded" &&
    intent.status != "canceled"
  ) {
    // for automatic confirm payments, anything not succeeded or canceled should
    // be the one returned for a given purpose.  There is only supposed to be at most one
    // unfinished with a given purpose *ever* at once for automatic payments.
    return true;
  }
  if (!intent.metadata.confirm && intent.status == "requires_payment_method") {
    // for one off payments need something with the purpose that hasn't started being paid.
    return true;
  }
  return false;
}

export async function getOpenPaymentIntent({ customer, purpose, confirm }) {
  const stripe = await getConn();
  // we just want the most recent one that requires_payment_method, if any.
  const recentPaymentIntents = await stripe.paymentIntents.list({ customer });
  for (const intent of recentPaymentIntents.data) {
    if (intent.metadata.purpose != purpose) {
      continue;
    }
    if (isOpenPaymentIntent(intent)) {
      return intent;
    }
  }

  // note that the query index is only updated *after a few seconds* so NOT reliable.
  // https://docs.stripe.com/payments/paymentintents/lifecycle#intent-statuses
  let query = `customer:"${customer}" AND metadata["purpose"]:"${purpose}" AND status:"requires_payment_method"`;
  if (confirm) {
    query += ' AND metadata["confirm"]:"true"';
  }
  const x = await stripe.paymentIntents.search({
    query,
    limit: 10,
  });
  // NOTE: the search index that stripe uses is wrong for a minute or two
  // (or maybe longer) after a payment completes, so we check each returned one
  // until finding one that really can be used.
  for (const intent of x.data) {
    if (isOpenPaymentIntent(intent)) {
      return intent;
    }
  }
  return undefined;
}



// These are all purchases for a specific user that *should* get
// paid ASAP, but haven't for some reason (e.g., no card, broken card,
// bank tranfser, etc.).
export async function getAllOpenPaymentIntents(account_id: string) {
  const customer = await getStripeCustomerId({ account_id, create: false });
  if (!customer) {
    return [];
  }

  // note that the query index is only updated *after a few seconds* to hour(s) so NOT reliable immediately!
  // https://docs.stripe.com/payments/paymentintents/lifecycle#intent-statuses
  const query = `customer:"${customer}" AND -metadata["purpose"]:null AND -status:"succeeded" AND -status:"canceled"`;
  const stripe = await getConn();
  const x = await stripe.paymentIntents.search({
    query,
    limit: 100, // should usually be very small, e.g., 0, 1 or 2.
  });
  // NOTE: the search index that stripe uses is wrong for a minute or two, so we do a "client side filter"
  return x.data.filter((intent) => {
    if (!intent.metadata.purpose) {
      return false;
    }
    if (intent.metadata.confirm) {
      return intent.status != "succeeded" && intent.status != "canceled";
    } else {
      return intent.status != "requires_payment_method";
    }
    return false;
  });
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
  await stripe.paymentIntents.cancel(id, {
    cancellation_reason: reason as any,
  });
}
