/*
Let user get all of their purchase quotas.
*/

import getAccountId from "lib/account/get-account";
import getPurchases from "@cocalc/server/purchases/get-purchases";
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
  const { limit, offset, service, project_id, group } = getParams(req);
  return await getPurchases({
    limit,
    offset,
    service,
    account_id,
    project_id,
    group,
  });
}
