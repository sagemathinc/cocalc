/*
Unstar a public path

- id of the public path
*/

import { unstar } from "@cocalc/server/public-paths/star";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    const account_id = await getAccountId(req);
    if (account_id == null) {
      throw Error("must be signed in to unstar");
    }
    const { id } = getParams(req, ["id"]);
    if (!id) {
      throw Error("must specify id of public path");
    }
    await unstar(id, account_id);
    res.json({});
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}
