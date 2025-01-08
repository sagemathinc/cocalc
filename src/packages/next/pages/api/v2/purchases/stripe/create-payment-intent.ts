import getAccountId from "lib/account/get-account";
import createPaymentIntent from "@cocalc/server/purchases/stripe/create-payment-intent";
import getParams from "lib/api/get-params";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
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
  const { user_account_id, lineItems, purpose, description, metadata } =
    getParams(req);
  if (user_account_id) {
    // admin version
    const admin_account_id = await getAccountId(req);
    if (admin_account_id == null) {
      throw Error("must be signed in");
    }
    throttle({
      account_id: admin_account_id,
      endpoint: "purchases/stripe/create-payment-intent",
    });
    if (!(await userIsInGroup(admin_account_id, "admin"))) {
      throw Error("only admins can create a payment");
    }
    await createPaymentIntent({
      account_id: user_account_id,
      lineItems,
      description,
      purpose,
      metadata: { ...metadata, admin_account_id },
    });
  } else {
    const account_id = await getAccountId(req);
    if (account_id == null) {
      throw Error("must be signed in");
    }
    throttle({
      account_id,
      endpoint: "purchases/stripe/create-payment-intent",
    });
    await createPaymentIntent({
      account_id,
      description,
      lineItems,
      purpose,
      metadata,
    });
  }
  return { success: true };
}
