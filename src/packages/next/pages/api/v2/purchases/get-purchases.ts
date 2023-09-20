/*
Let user get all of their purchases
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
  if (!account_id) {
    throw Error("must be signed in");
  }
  const {
    limit,
    offset,
    service,
    project_id,
    group,
    cutoff,
    thisMonth,
    day_statement_id,
    month_statement_id,
    no_statement,
  } = getParams(req);
  return await getPurchases({
    cutoff,
    thisMonth,
    limit,
    offset,
    service,
    account_id,
    project_id,
    group,
    day_statement_id,
    month_statement_id,
    no_statement,
  });
}
