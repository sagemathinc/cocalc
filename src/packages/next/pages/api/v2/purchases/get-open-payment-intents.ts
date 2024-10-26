import getAccountId from "lib/account/get-account";
import { getAllOpenConfirmPaymentIntents } from "@cocalc/server/purchases/payment-intent";
import throttle from "@cocalc/server/api/throttle";

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
  throttle({
    account_id,
    endpoint: "get-open-payment-intents",
    interval: 2000,
  });
  const data = await getAllOpenConfirmPaymentIntents(account_id);
  return { success: true, data };
}
