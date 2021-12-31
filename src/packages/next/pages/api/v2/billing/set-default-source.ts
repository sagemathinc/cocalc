/*
Set default payment source for signed in customer.
*/

import setDefaultSource from "@cocalc/server/billing/set-default-source";
import getAccountId from "lib/account/get-account";
import isPost from "lib/api/is-post";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;
  try {
    res.json(await set(req));
  } catch (err) {
    res.json({ error: `${err}` });
    return;
  }
}

async function set(req): Promise<{ success: true }> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in to set stripe default card");
  }
  const { default_source } = req.body;
  if (!default_source) {
    throw Error("must specify the default source");
  }
  await setDefaultSource(account_id, default_source);
  return { success: true };
}
