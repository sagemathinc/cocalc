/*
User query endpoint.
*/

import userQuery from "@cocalc/database/user-query";
import getAccountId from "lib/account/get-account";
import isPost from "lib/api/is-post";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;

  const account_id = await getAccountId(req);
  // account_id = undefined <--> anonymous queries, which do exist.

  const { query } = req.body;

  try {
    const result = await userQuery({ account_id, query });
    res.json({ query: result });
  } catch (err) {
    res.json({ error: `${err.message}` });
  }
}
