/*
Handle a token action.
*/

import handleTokenAction from "@cocalc/server/token-actions/handle";
import getParams from "lib/api/get-params";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const { token } = getParams(req);
  const account_id = await getAccountId(req);

  return await handleTokenAction(token, account_id);
}
