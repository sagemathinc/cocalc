import { Router } from "express";
import { getLogger } from "@cocalc/hub/logger";
import bodyParser from "body-parser";
import { getServerSettings } from "@cocalc/server/settings/server-settings";
import getConn from "@cocalc/server/stripe/connection";
import { createCreditFromPaidStripeInvoice } from "@cocalc/server/purchases/create-invoice";

const logger = getLogger("hub:stripe-webhook");

export default function init(app_router: Router) {
  const router = Router();

  router.use(bodyParser.raw({ type: "application/json" }));
  // return uuid-indexed blobs (mainly used for graphics)
  router.post("", async (req, res) => {
    logger.debug("POST");

    try {
      await handleRequest(req);
    } catch (err) {
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    // Return a 200 response to acknowledge receipt of the event
    res.send();
  });

  router.get("", async (_req, res) => {
    logger.debug("GET");
    res.json({ status: "ok", message: "the webhooks/stripe url exists" });
  });

  app_router.use("/webhooks/stripe", router);
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
  logger.debug("event = ", event);
  console.log("event = ", event);

  // Handle the event
  switch (event.type) {
    case "invoice.paid":
      const invoice = event.data.object;
      // Then define and call a function to handle the event invoice.paid
      logger.debug("invoice = ", invoice);
      await createCreditFromPaidStripeInvoice(invoice);
      break;
    // ... handle other event types
    default:
      console.log(`Unhandled event type ${event.type}`);
  }
}
