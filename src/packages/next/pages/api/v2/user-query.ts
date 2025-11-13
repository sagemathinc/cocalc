/*
User query endpoint.
*/

import userQuery from "@cocalc/database/user-query";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  UserQueryInputSchema,
  UserQueryOutputSchema,
} from "lib/api/schema/user-query";

async function handle(req, res) {
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

export default apiRoute({
  userQuery: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Utils"],
    },
  })
    .input({
      contentType: "application/json",
      body: UserQueryInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: UserQueryOutputSchema,
      },
    ])
    .handler(handle),
});
