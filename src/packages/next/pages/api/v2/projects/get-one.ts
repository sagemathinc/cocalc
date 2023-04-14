/* Get projects that belongs to the authenticated user.
   If the user has no projects, creates one.
   If they have projects, returns the most recently active one.
*/

import getAccountId from "lib/account/get-account";
import getOneProject from "@cocalc/server/projects/get-one";

export default async function handle(req, res) {
  const account_id = await getAccountId(req);
  try {
    res.json(await getOneProject(account_id));
  } catch (err) {
    res.json({ error: err.message });
  }
}
