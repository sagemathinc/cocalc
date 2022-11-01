/*
User query endpoint.
*/

import userQuery from "@cocalc/database/user-query";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  const account_id = await getAccountId(req);
  // account_id = undefined <--> anonymous queries, which do exist.

  const { query } = getParams(req);

  try {
    const result = await userQuery({ account_id, query });
    res.json({ query: result });
  } catch (err) {
    res.json({ error: `${err.message ? err.message : err}` });
  }
}
