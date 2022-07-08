/*
Set default payment source for signed in customer.
*/

import setDefaultSource from "@cocalc/server/billing/set-default-source";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

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
    throw Error("must be signed in to set stripe default card");
  }
  const { default_source } = getParams(req);
  if (!default_source) {
    throw Error("must specify the default source");
  }
  await setDefaultSource(account_id, default_source);
  return { success: true };
}
