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
  const { config } = getParams(req);
  await vouchersCheckout({
    account_id,
    config,
  });
  return { success: true };
}
