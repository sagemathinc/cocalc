/* Get projects that the authenticated user is a collaborator on. */

import getAccountId from "lib/account/get-account";
import getProjects from "@cocalc/server/projects/get";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  const account_id = await getAccountId(req);
  try {
    if (account_id == null) throw Error("must be authenticated");
    const { limit } = getParams(req, ["limit"]);
    res.json(await getProjects({ account_id, limit }));
  } catch (err) {
    res.json({ error: err.message });
  }
}
