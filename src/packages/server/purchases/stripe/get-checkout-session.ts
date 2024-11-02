import getConn from "@cocalc/server/stripe/connection";
import getLogger from "@cocalc/backend/logger";
import { getStripeCustomerId, sanityCheckAmount } from "./util";
import type {
  CheckoutSessionSecret,
  CheckoutSessionOptions,
  LineItem,
} from "@cocalc/util/stripe/types";
import base_path from "@cocalc/backend/base-path";
import { getServerSettings } from "@cocalc/database/settings/server-settings";
import { isEqual } from "lodash";
import { currency } from "@cocalc/util/misc";

const logger = getLogger("purchases:stripe:get-checkout-session");

interface Options extends CheckoutSessionOptions {
  // user that is paying: assumed already authenticated/valid
  account_id: string;
}

export default async function getCheckoutSession({
  account_id,
  purpose,
  description,
  lineItems,
  return_url,
  metadata,
}: Options): Promise<CheckoutSessionSecret> {
  logger.debug("getCheckoutSession", {
    account_id,
    purpose,
    description,
    lineItems,
    return_url,
    metadata,
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

  let total = 0;
  for (const { amount } of lineItems) {
    total += amount;
  }
  await sanityCheckAmount(total);

  const stripe = await getConn();
  const customer = await getStripeCustomerId({ account_id, create: true });
  if (!customer) {
    throw Error("bug");
  }

  metadata = {
    ...metadata,
    purpose,
    account_id,
    lineItems: JSON.stringify(lineItems),
  };

  if (!return_url) {
    const { dns } = await getServerSettings();
    return_url = `https://${dns}${base_path}`;
  }

  const openSessions = await stripe.checkout.sessions.list({
    status: "open",
    customer,
  });
  for (const session of openSessions.data) {
    if (session.metadata?.purpose == purpose && session.client_secret) {
      if (!isEqual(session.metadata?.lineItems, JSON.stringify(lineItems))) {
        // The line items or description changed, so we can't use it.
        await stripe.checkout.sessions.expire(session.id);
      } else {
        // we use it -- same line items
        return { clientSecret: session.client_secret };
      }
    }
  }

  let session;
  if (false) {
    // just a proof of concept -- will be moved elsewhere for setting up payg or new subscriptions.
    session = await stripe.checkout.sessions.create({
      customer,
      ui_mode: "embedded",
      mode: "setup",
      return_url,
      metadata,
      currency: "usd",
    });
  } else {
    session = await stripe.checkout.sessions.create({
      customer,
      ui_mode: "embedded",
      line_items: accountForCredit(lineItems).map(({ amount, description }) => {
        return {
          price_data: {
            unit_amount: Math.ceil(amount * 100),
            currency: "usd",
            product_data: {
              name: description,
            },
          },
          quantity: 1,
        };
      }),
      mode: "payment",
      return_url,
      redirect_on_completion: "if_required",
      automatic_tax: { enabled: true },
      metadata,
      payment_intent_data: {
        description,
        setup_future_usage: "off_session",
        metadata,
      },

      // not sure we'll use this, but it's a good double check
      client_reference_id: account_id,
      invoice_creation: {
        enabled: true,
        invoice_data: {
          metadata,
        },
      },
      tax_id_collection: { enabled: true },
      customer_update: {
        address: "auto",
        name: "auto",
        shipping: "auto",
      },
      saved_payment_method_options: {
        allow_redisplay_filters: ["limited", "always", "unspecified"],
      },
    });
  }

  if (!session.client_secret) {
    throw Error("unable to create session");
  }

  return { clientSecret: session.client_secret };
}

function accountForCredit(lineItems: LineItem[]): LineItem[] {
  let credit = 0;
  let total = 0;
  for (const item of lineItems) {
    const amount = Math.ceil(100 * item.amount);
    if (item.amount < 0) {
      credit += Math.abs(amount);
    }
    total += amount;
  }
  if (credit == 0) {
    // no credits
    return lineItems;
  }
  if (total <= 0) {
    throw Error("invalid payment: credits exceed charges");
  }
  // reduce charges to use up the credits
  const newLineItems: LineItem[] = [];
  for (const item of lineItems) {
    const amount = Math.ceil(100 * item.amount);
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
          ` (${currency(creditToUse / 100)} credit deducted)`,
        amount: amount2 / 100,
      });
    }
  }
  return newLineItems;
}
