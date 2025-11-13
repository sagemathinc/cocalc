/*
API endpoint to find files that you've edited in the
last year or so by their filename.
It's under 'projects' since it's also a way to find the
project you want to open.
*/

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { filenameSearch } from "@cocalc/server/projects/filename-search";

export default async function handle(req, res) {
  const { search } = getParams(req);
  try {
    const account_id = await getAccountId(req);
    if (!account_id) {
      throw Error("must be signed in");
    }
    res.json(await filenameSearch({ search, account_id }));
  } catch (err) {
    res.json({ error: `${err.message}` });
  }
}
