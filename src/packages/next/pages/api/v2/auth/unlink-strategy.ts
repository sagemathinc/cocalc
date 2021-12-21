/* api call to unlink a specific single sign on for the currently authenticated user */

import unlinkStrategy from "@cocalc/server/auth/sso/unlink-strategy";
import getAccountId from "lib/account/get-account";
import isPost from "lib/api/is-post";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;
  try {
    const account_id = await getAccountId(req);
    if (!account_id) {
      throw Error("must be signed in");
    }
    const { name } = req.body;
    await unlinkStrategy({ account_id, name });
  } catch (err) {
    res.json({ error: err.message });
  }
}
