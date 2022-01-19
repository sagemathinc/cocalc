/*
Get all licenses that the signed in user manages.

See docs in @cocalc/server/licenses/get-managed.ts

Returns [License1, License2, ...] on success or {error:'a message'} on failure.
For the fields in the License objects, see @cocalc/server/licenses/get-managed.ts
*/

import getManagedLicenses, {
  License,
} from "@cocalc/server/licenses/get-managed";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req): Promise<License[]> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    return [];
  }
  return await getManagedLicenses(account_id);
}
