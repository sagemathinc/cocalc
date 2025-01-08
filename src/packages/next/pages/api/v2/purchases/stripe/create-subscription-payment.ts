import getAccountId from "lib/account/get-account";
import createSubscriptionPayment from "@cocalc/server/purchases/stripe/create-subscription-payment";
import getParams from "lib/api/get-params";
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
  throttle({
    account_id,
    endpoint: "purchases/stripe/create-subscription-payment",
  });
  const { subscription_id } = getParams(req);
  await createSubscriptionPayment({
    account_id,
    subscription_id,
  });
  return { success: true };
}
