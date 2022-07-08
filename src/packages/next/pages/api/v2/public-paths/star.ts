/*
Star a public path

- id of the public path
*/

import { star } from "@cocalc/server/public-paths/star";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    const account_id = await getAccountId(req);
    if (account_id == null) {
      throw Error("must be signed in to star");
    }
    const { id } = getParams(req);
    if (!id) {
      throw Error("must specify id of public path");
    }
    await star(id, account_id);
    res.json({});
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}
