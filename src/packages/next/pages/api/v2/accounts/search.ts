/*
Search for accounts matching a given query.

If user is signed in, then their account_id is used to prioritize the search.
*/

import userSearch from "@cocalc/server/accounts/search";
import type { User } from "@cocalc/server/accounts/search";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    return res.json(await doUserSearch(req));
  } catch (err) {
    res.json({ error: err.message });
  }
}

async function doUserSearch(req): Promise<User[]> {
  const { query } = getParams(req);
  return await userSearch({ query });
}
