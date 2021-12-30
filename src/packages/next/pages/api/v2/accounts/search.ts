/*
Search for accounts matching a given query.

If user is signed in, then their account_id is used to prioritize the search.
*/

import isPost from "lib/api/is-post";
import userSearch from "@cocalc/server/accounts/search";
import type { User } from "@cocalc/server/accounts/search";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;

  try {
    return res.json(await doUserSearch(req));
  } catch (err) {
    res.json({ error: `${err}` });
  }
}

async function doUserSearch(req): Promise<User[]> {
  return await userSearch({ query: req.body.query });
}
