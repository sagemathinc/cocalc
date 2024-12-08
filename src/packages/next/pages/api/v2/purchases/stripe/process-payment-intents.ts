import getAccountId from "lib/account/get-account";
import processPaymentIntents from "@cocalc/server/purchases/stripe/process-payment-intents";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in");
  }
  return { count: await processPaymentIntents({ account_id }), success: true };
}
