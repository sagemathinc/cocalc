import getAccountId from "lib/account/get-account";
import getPayments from "@cocalc/server/purchases/stripe/get-payments";
import throttle from "@cocalc/util/api/throttle";
import getParams from "lib/api/get-params";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";

// See https://docs.stripe.com/api/payment_intents/list for definition of
// all parameters, which are passed in exactly to stripe's api.  In particular,
// time is in seconds and is either or string or number depending on how given,
// and ending_before, starting_after are NOT times but object id's.

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
  throttle({ account_id, endpoint: "purchases/stripe/get-payments" });

  const {
    user_account_id,
    created,
    ending_before,
    starting_after,
    limit,
    unfinished,
    canceled,
  } = getParams(req);
  if (user_account_id) {
    // This user MUST be an admin:
    if (!(await userIsInGroup(account_id, "admin"))) {
      throw Error("only admins can get other user's open payments");
    }
    return await getPayments({
      account_id: user_account_id,
      created,
      ending_before,
      starting_after,
      limit,
      unfinished,
      canceled,
    });
  }

  return await getPayments({
    account_id,
    created,
    ending_before,
    starting_after,
    limit,
    unfinished,
    canceled,
  });
}
