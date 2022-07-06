/* api call to unlink a specific single sign on for the currently authenticated user */

import unlinkStrategy from "@cocalc/server/auth/sso/unlink-strategy";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    const account_id = await getAccountId(req);
    if (!account_id) {
      throw Error("must be signed in");
    }
    const { name } = getParams(req);
    await unlinkStrategy({ account_id, name });
  } catch (err) {
    res.json({ error: err.message });
  }
}
