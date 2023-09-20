import getAccountId from "lib/account/get-account";
import vouchersCheckout from "@cocalc/server/purchases/vouchers-checkout";
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
  const { success_url, cancel_url, config } = getParams(req);
  return await vouchersCheckout({
    account_id,
    success_url,
    cancel_url,
    config,
  });
}
