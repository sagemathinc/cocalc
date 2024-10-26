import getAccountId from "lib/account/get-account";
import { createPaymentIntent } from "@cocalc/server/purchases/payment-intent";
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
  const { user_account_id, amount, description, purpose } = getParams(req);
  if (user_account_id) {
    // admin version
    const admin_account_id = await getAccountId(req);
    if (admin_account_id == null) {
      throw Error("must be signed in");
    }
    if (!(await userIsInGroup(admin_account_id, "admin"))) {
      throw Error("only admins can create a payment");
    }
    const { user_account_id, amount, description } = getParams(req);
    return await createPaymentIntent({
      account_id: user_account_id,
      amount,
      description,
      confirm: true,
      purpose,
      metadata: { admin_account_id },
    });
  } else {
    const account_id = await getAccountId(req);
    if (account_id == null) {
      throw Error("must be signed in");
    }
    return await createPaymentIntent({
      account_id,
      amount,
      description,
      purpose,
    });
  }
}
