/* Return information about a given license. */

import getAccountId from "lib/account/get-account";
import isPost from "lib/api/is-post";
import checkDedicateDiskName from "@cocalc/server/licenses/check-disk-name";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;

  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: err.message });
    return;
  }
}

async function get(req): Promise<void> {
  const account_id = await getAccountId(req);
  if (account_id == null) throw new Error(`user not logged in`);
  return await checkDedicateDiskName(req.body.name);
}
