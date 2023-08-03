/*
Let user get all of their statements. 

- interval -- 'day' or 'month'.
*/

import getAccountId from "lib/account/get-account";
import getStatements from "@cocalc/server/purchases/statements/get-statements";
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
  const { limit, offset, interval } = getParams(req);
  if (interval != "day" && interval != "month") {
    throw Error("interval must be 'day' or 'month'");
  }
  return await getStatements({
    limit,
    offset,
    account_id,
    interval,
  });
}
