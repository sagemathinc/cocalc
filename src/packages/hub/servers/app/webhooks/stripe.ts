/*
Stripe Webhook to handle some events:

- invoice.paid --
- customer.subscription.created -- used for the webhook side of @cocalc/server/purchases/stripe-usage-based-subscription.ts

We *do* check the stripe signature to only handle requests that actually come from stripe.
See https://stripe.com/docs/webhooks/signatures for where the code comes from.

To test this in dev you need to use the stripe cli, which is a big GO program.
For some reason the binary just hangs when trying to run it on cocalc.com (maybe
due to how locked down our Docker containers are?), so it also seems only
possible to test/debug this in cocalc-docker or somewhere else.
*/

import { Router } from "express";
import { getLogger } from "@cocalc/hub/logger";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import getConn from "@cocalc/server/stripe/connection";
import {
  createCreditFromPaidStripeInvoice,
  createCreditFromPaidStripePaymentIntent,
} from "@cocalc/server/purchases/create-invoice";
import * as express from "express";
import { isValidUUID } from "@cocalc/util/misc";
import { setUsageSubscription } from "@cocalc/server/purchases/stripe-usage-based-subscription";

const logger = getLogger("hub:stripe-webhook");

export default function init(router: Router) {
  router.post(
    "/webhooks/stripe",
    express.raw({ type: "application/json" }),
    async (req, res) => {
      logger.debug("POST");

      try {
        await handleRequest(req);
      } catch (err) {
        const error = `Webhook Error: ${err.message}`;
        logger.error(error);
        console.error(error);
        res.status(400).send(error);
        return;
      }

      // Return a 200 response to acknowledge receipt of the event
      res.send();
    }
  );
}

async function handleRequest(req) {
  const { stripe_webhook_secret } = await getServerSettings();
  const stripe = await getConn();
  const sig = req.headers["stripe-signature"];
  const event = stripe.webhooks.constructEvent(
    req.body,
    sig,
    stripe_webhook_secret
  );
  logger.debug("event.type = ", event.type);

  // Handle the event
  switch (event.type) {
    case "invoice.paid":
      const invoice = event.data.object;
      // Then define and call a function to handle the event invoice.paid
      logger.debug("invoice = ", invoice);
      await createCreditFromPaidStripeInvoice(invoice);
      break;

    case "payment_intent.succeeded":
      // This is I think ONLY used for deprecated credit cards.
      const intent = event.data.object;
      logger.debug("intent = ", intent);
      await createCreditFromPaidStripePaymentIntent(intent);
      break;

    case "customer.subscription.created":
      logger.debug("event = ", event);
      const { id, object } = (event.data?.object ?? {}) as any;
      if (object == "subscription") {
        const { account_id, service } =
          (event.data?.object as any)?.metadata ?? {};
        if (isValidUUID(account_id) && service == "credit") {
          await setUsageSubscription({ account_id, subscription_id: id });
        }
      }
      break;

    default:
      // we don't handle any other event types yet.
      logger.debug(`Unhandled event type ${event.type}`);
   //   logger.debug(event);
  }
}
