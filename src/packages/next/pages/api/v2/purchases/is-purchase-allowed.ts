/*
Determine whether or not user can purchase some amount of a given
service via pay-as-you-go, given all quotas and current balance.

PARAMS:

  - service (required): one of the services, e.g., openai-gpt-4
  - cost (optional): cost in dollars of that service; if not given, some amount may be
    chosen based on the service, e.g., for gpt-4 it is the maximum cost of a single API call.

RETURNS:

  - {allowed:boolean; discouraged?:boolean; reason?:string}   or {error:message} (e.g., if not signed in)
*/

import getAccountId from "lib/account/get-account";
import { isPurchaseAllowed } from "@cocalc/server/purchases/is-purchase-allowed";
import getParams from "lib/api/get-params";

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
  if (account_id == null) {
    throw Error("must be signed in");
  }
  const { service, cost } = getParams(req);
  return await isPurchaseAllowed({ account_id, service, cost });
}
