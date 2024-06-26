/*
Search for accounts matching a given query.

If user is signed in, then their account_id is used to prioritize the search.
*/

import userSearch from "@cocalc/server/accounts/search";
import type { User } from "@cocalc/server/accounts/search";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  AccountSearchInputSchema,
  AccountSearchOutputSchema,
} from "lib/api/schema/accounts/search";

async function handle(req, res) {
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

export default apiRoute({
  search: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Accounts"],
    },
  })
    .input({
      contentType: "application/json",
      body: AccountSearchInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: AccountSearchOutputSchema,
      },
    ])
    .handler(handle),
});
