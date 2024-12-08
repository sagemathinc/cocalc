import getAccountId from "lib/account/get-account";
import { shoppingCartCheckout } from "@cocalc/server/purchases/shopping-cart-checkout";

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
  await shoppingCartCheckout({ account_id });
  return { success: true };
}
