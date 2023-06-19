/*
v2 API endpoint for managing your api keys
*/

import getAccountId from "lib/account/get-account";
import manageApiKeys from "@cocalc/server/api/manage";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    const account_id = await getAccountId(req);
    if (!account_id) {
      throw Error("must be signed in");
    }
    const { action, project_id, name, expire, id } = getParams(req);
    const response = await manageApiKeys({
      account_id,
      action,
      project_id,
      name,
      expire,
      id,
    });
    res.json({ response });
  } catch (err) {
    res.json({ error: err.message });
  }
}
