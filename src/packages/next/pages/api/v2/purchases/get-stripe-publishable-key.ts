// Not part of customize because its rare to need this -- only when actually making
// an explicit purchase.

import getAccountId from "lib/account/get-account";
import { getServerSettings } from "@cocalc/database/settings/server-settings";

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
  const { stripe_publishable_key } = await getServerSettings();
  return { stripe_publishable_key };
}
