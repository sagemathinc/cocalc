/*
v2 API endpoint for managing your legacy API key.
*/

import getAccountId from "lib/account/get-account";
import { legacyManageApiKey } from "@cocalc/server/api/manage";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    const account_id = await getAccountId(req);
    if (!account_id) {
      throw Error("must be signed in");
    }
    const { action, password } = getParams(req);
    const api_key = await legacyManageApiKey({ account_id, password, action });
    res.json({ api_key });
  } catch (err) {
    res.json({ error: err.message });
  }
}
