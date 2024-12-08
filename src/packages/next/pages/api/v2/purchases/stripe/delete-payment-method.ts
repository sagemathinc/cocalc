import deletePaymentMethod from "@cocalc/server/purchases/stripe/delete-payment-method";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import throttle from "@cocalc/util/api/throttle";

export default async function handle(req, res) {
  try {
    res.json(await set(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function set(req): Promise<{ success: true }> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to delete payment method");
  }
  throttle({ account_id, endpoint: "purchases/stripe/delete-payment-method" });
  const { payment_method } = getParams(req);
  if (!payment_method) {
    throw Error("must specify the payment method to delete");
  }
  await deletePaymentMethod({ payment_method });
  return { success: true };
}
