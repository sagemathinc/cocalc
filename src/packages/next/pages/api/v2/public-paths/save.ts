/* Request to save a particular public path. */

import savePublicPath from "@cocalc/server/public-paths/save";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    const account_id = await getAccountId(req);
    if (account_id == null) {
      throw Error(
        "must be signed in to save public path (have to be collab on project)"
      );
    }
    const { id } = getParams(req, ["id"]);
    if (!id) {
      throw Error("must specify id of public path");
    }
    await savePublicPath(id, account_id);
    res.json({});
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}
