/*
User query endpoint.
*/

import userQuery from "@cocalc/database/user-query";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  if (req.method !== "POST") {
    res.status(404).json({ message: "must use a POST request" });
    return;
  }

  const account_id = await getAccountId(req);
  // account_id = undefined <--> anonymous queries, which do exist.

  const { query } = req.body;

  try {
    const result = await userQuery({ account_id, query });
    res.json({ query: result });
  } catch (err) {
    res.json({ error: `${err}` });
  }
}
