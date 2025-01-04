/*
Check if DNS subdomain is available.
*/

import getAccountId from "lib/account/get-account";
import { isDnsAvailable } from "@cocalc/server/compute/dns";
import getParams from "lib/api/get-params";
import throttle from "@cocalc/util/api/throttle";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const account_id = await getAccountId(req);
  if (!account_id) {
    throw Error("must be signed in");
  }
  throttle({
    account_id,
    endpoint: "compute/is-dns-available",
  });
  const { dns } = getParams(req);
  return {
    isAvailable: await isDnsAvailable(dns),
  };
}
