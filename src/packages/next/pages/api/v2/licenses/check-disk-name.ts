/* Return information about a given license. */

import getPool from "@cocalc/database/pool";
import checkDedicateDiskName from "@cocalc/util/licenses/check-disk-name";
import getAccountId from "lib/account/get-account";
import isPost from "lib/api/is-post";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;

  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: err.message });
    return;
  }
}

async function get(req): Promise<{ available: boolean }> {
  const account_id = await getAccountId(req);
  if (account_id == null) throw new Error(`user not logged in`);
  return await checkDedicateDiskName(getPool(), req.body.name);
}
