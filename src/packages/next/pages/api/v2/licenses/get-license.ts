/* Return information about a given license. */

import getLicense, {
  getLicenseBySubscriptionId,
} from "@cocalc/server/licenses/get-license";
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

async function get(req) {
  const account_id = await getAccountId(req);
  const { license_id, subscription_id } = getParams(req);
  if (license_id) {
    // account_id = null is OK -- then get very minimal info about the license.
    return await getLicense(license_id, account_id);
  } else if (subscription_id) {
    // user must be owner of subscription
    if (account_id == null) {
      throw Error("must be signed in");
    }
    return await getLicenseBySubscriptionId(subscription_id, account_id);
  } else {
    throw Error("license_id or subscription_id must be specified");
  }
}
