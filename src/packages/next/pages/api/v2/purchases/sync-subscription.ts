import getAccountId from "lib/account/get-account";
import { syncUsageBasedSubscription } from "@cocalc/server/purchases/stripe-usage-based-subscription";
import { OkStatus } from "../../../../lib/api/status";

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

  const found = await syncUsageBasedSubscription(account_id);
  return {
    ...OkStatus,
    found,
  };
}
