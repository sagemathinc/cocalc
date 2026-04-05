import getConn from "@cocalc/server/stripe/connection";
import getLogger from "@cocalc/backend/logger";
import {
  assertValidUserMetadata,
  getStripeCustomerId,
  sanityCheckAmount,
  getStripeLineItems,
} from "./util";
import type {
  CheckoutSessionSecret,
  CheckoutSessionOptions,
} from "@cocalc/util/stripe/types";
import { STUDENT_PAY } from "@cocalc/util/db-schema/purchases";
import { isEqual } from "lodash";
import { decimalToStripe, decimalAdd } from "@cocalc/util/stripe/calc";
import { url } from "@cocalc/server/messages/send";
import {
  studentPayAssertNotPaying,
  studentPaySetCheckoutSession,
} from "@cocalc/server/purchases/student-pay";

const logger = getLogger("purchases:stripe:get-checkout-session");
const LINE_ITEMS_METADATA_KEY = "line_items_json";
const DESCRIPTION_METADATA_KEY = "checkout_description";

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
  const project_id = metadata?.project_id;
  logger.debug("getCheckoutSession", {
    account_id,
    purpose,
    project_id,
    description,
    lineItems,
    return_url,
    metadata,
  });
  if (!purpose) {
    throw Error("purpose must be set");
  }
  assertValidUserMetadata(metadata);
  if (purpose == STUDENT_PAY) {
    if (!project_id) {
      throw Error("project_id must be set for student-pay checkout");
    }
    await studentPayAssertNotPaying({ project_id });
  }

  let total = 0;
  for (const { amount } of lineItems) {
    total = decimalAdd(total, amount);
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
  };

  if (!return_url) {
    return_url = await url();
  }

  const openSessions = await stripe.checkout.sessions.list({
    status: "open",
    customer,
  });
  logger.debug("getCheckoutSession: listed open checkout sessions", {
    account_id,
    purpose,
    project_id,
    customer,
    open_session_count: openSessions.data.length,
  });
  // cutoff = an hour ago in stripe time.  Restricting only to status='open'
  // as above should work, but doesn't, since we had many reports of users
  // with open checkout sessions that didn't work. This might help.
  const cutoff = Math.floor((Date.now() - 1000 * 60 * 60) / 1000);
  for (const session of openSessions.data) {
    if (session.metadata?.purpose == purpose && session.client_secret) {
      // Store a deterministic fingerprint of the checkout inputs in metadata so
      // later calls can safely reuse the same open session instead of expiring it
      // and creating a fresh one every time the UI asks for the client secret.
      if (
        !isEqual(
          session.metadata?.[LINE_ITEMS_METADATA_KEY],
          JSON.stringify(lineItems),
        ) ||
        !isEqual(
          session.metadata?.[DESCRIPTION_METADATA_KEY],
          description ?? "",
        ) ||
        session.created <= cutoff
      ) {
        logger.debug("getCheckoutSession: expiring checkout session", {
          account_id,
          purpose,
          project_id,
          session_id: session.id,
          session_created: session.created,
          line_items_match: isEqual(
            session.metadata?.[LINE_ITEMS_METADATA_KEY],
            JSON.stringify(lineItems),
          ),
          description_match: isEqual(
            session.metadata?.[DESCRIPTION_METADATA_KEY],
            description ?? "",
          ),
          older_than_cutoff: session.created <= cutoff,
        });
        // The line items or description changed or its older than an hour, so don't use it.
        await stripe.checkout.sessions.expire(session.id);
      } else {
        logger.debug("getCheckoutSession: using existing checkout session", {
          account_id,
          purpose,
          project_id,
          session_id: session.id,
          session_created: session.created,
        });
        if (purpose == STUDENT_PAY) {
          await studentPaySetCheckoutSession({
            project_id: project_id!,
            checkoutSessionId: session.id,
          });
        }
        // Reuse the existing open session when the checkout inputs still match.
        return { clientSecret: session.client_secret };
      }
    }
  }

  const { lineItemsWithoutCredit, total_excluding_tax_usd } =
    getStripeLineItems(lineItems);

  metadata = {
    ...metadata,
    [LINE_ITEMS_METADATA_KEY]: JSON.stringify(lineItems),
    [DESCRIPTION_METADATA_KEY]: description ?? "",
    total_excluding_tax_usd: `${total_excluding_tax_usd}`,
  };
  logger.debug("getCheckoutSession: creating checkout session", {
    account_id,
    purpose,
    project_id,
    customer,
    line_item_count: lineItemsWithoutCredit.length,
    total_excluding_tax_usd,
  });
  const session = await stripe.checkout.sessions.create({
    customer,
    ui_mode: "embedded",
    line_items: lineItemsWithoutCredit.map(({ amount, description }) => {
      return {
        price_data: {
          unit_amount: decimalToStripe(amount),
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
      metadata: { ...metadata, confirm: "true" },
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

  if (!session.client_secret) {
    throw Error("unable to create session");
  }

  logger.debug("getCheckoutSession: created checkout session", {
    account_id,
    purpose,
    project_id,
    session_id: session.id,
  });
  if (purpose == STUDENT_PAY) {
    await studentPaySetCheckoutSession({
      project_id: project_id!,
      checkoutSessionId: session.id,
    });
  }

  return { clientSecret: session.client_secret };
}
