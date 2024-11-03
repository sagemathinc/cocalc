import getAccountId from "lib/account/get-account";
import { cancelPaymentIntent } from "@cocalc/server/purchases/stripe/create-payment-intent";
import getParams from "lib/api/get-params";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";

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
  if (!(await userIsInGroup(account_id, "admin"))) {
    throw Error("only admins can cancel an open payment");
  }
  const { id, reason } = getParams(req);
  await cancelPaymentIntent({ id, reason });
  return { success: true };
}
