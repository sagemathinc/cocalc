import getAccountId from "lib/account/get-account";
import getCustomerSession from "@cocalc/server/purchases/stripe/get-customer-session";
import throttle from "@cocalc/util/api/throttle";

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
  throttle({ account_id, endpoint: "purchases/stripe/get-customer-session" });
  return await getCustomerSession(account_id);
}
