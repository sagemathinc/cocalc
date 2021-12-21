/*
v2 API endpoint for managing your v1 API key.
*/

import getAccountId from "lib/account/get-account";
import isPost from "lib/api/is-post";
import apiKeyAction from "@cocalc/server/api/manage";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;
  try {
    const account_id = await getAccountId(req);
    if (!account_id) {
      throw Error("must be signed in");
    }
    const { action, password } = req.body;
    const api_key = await apiKeyAction({ account_id, password, action });
    res.json({ api_key });
  } catch (err) {
    res.json({ error: err.message });
  }
}
