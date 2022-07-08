/* Return information about a given license. */

import getLicense, { License } from "@cocalc/server/licenses/get-license";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: err.message });
    return;
  }
}

async function get(req): Promise<License> {
  const account_id = await getAccountId(req); // account_id = null is OK -- then get very minimal info about the license.
  const { license_id } = getParams(req);
  return await getLicense(license_id, account_id);
}
