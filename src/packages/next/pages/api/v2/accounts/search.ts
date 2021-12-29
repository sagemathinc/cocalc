/*
Search for accounts matching a given query.

If user is signed in, then their account_id is used to prioritize the search.
*/

import isPost from "lib/api/is-post";
import userSearch from "@cocalc/server/accounts/search";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;

  try {
    return res.json(await doUserSearch(req));
  } catch (err) {
    res.json({ error: `${err}` });
  }
}

async function doUserSearch(_req) {
  throw Error("not implemented");
}
