import getAccountId from "lib/account/get-account";
import { getShoppingCartCheckoutParams } from "@cocalc/server/purchases/shopping-cart-checkout";
import getParams from "lib/api/get-params";

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
  const { payment_intent, processing } = getParams(req);
  return await getShoppingCartCheckoutParams(
    account_id,
    payment_intent,
    processing,
  );
}
