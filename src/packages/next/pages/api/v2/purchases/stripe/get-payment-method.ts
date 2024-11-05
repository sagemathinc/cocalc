import getAccountId from "lib/account/get-account";
import { getPaymentMethod } from "@cocalc/server/purchases/stripe/get-payment-methods";
import throttle from "@cocalc/util/api/throttle";
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
  throttle({ account_id, endpoint: "purchases/stripe/get-payment-method" });

  const { user_account_id, id } = getParams(req);
  if (user_account_id) {
    // This user MUST be an admin:
    if (!(await userIsInGroup(account_id, "admin"))) {
      throw Error("only admins can get other user's payment methods");
    }
    return await getPaymentMethod({
      account_id: user_account_id,
      id,
    });
  }

  return await getPaymentMethod({
    account_id,
    id,
  });
}
