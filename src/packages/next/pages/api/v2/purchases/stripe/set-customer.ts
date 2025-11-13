import getAccountId from "lib/account/get-account";
import { setCustomer } from "@cocalc/server/purchases/stripe/customer";
import throttle from "@cocalc/util/api/throttle";
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
  throttle({ account_id, endpoint: "purchases/stripe/set-customer" });
  const { changes } = getParams(req);
  await setCustomer(account_id, changes);
  return { success: true };
}
