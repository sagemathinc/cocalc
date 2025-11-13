/*
Set account {user/first/last} name.
*/

import userQuery from "@cocalc/database/user-query";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import { SuccessStatus } from "lib/api/status";
import {
  SetAccountNameInputSchema,
  SetAccountNameOutputSchema,
} from "lib/api/schema/accounts/set-name";

async function handle(req, res) {
  try {
    await get(req);
    res.json(SuccessStatus);
  } catch (err) {
    res.json({ error: `${err.message ? err.message : err}` });
    return;
  }
}

async function get(req) {
  const client_account_id = await getAccountId(req);

  if (client_account_id == null) {
    throw Error("Must be signed in to edit account name.");
  }

  const { username, first_name, last_name, account_id } = getParams(req);

  // This user MUST be an admin:
  if (account_id && !(await userIsInGroup(client_account_id, "admin"))) {
    throw Error(
      "The `account_id` field may only be specified by account administrators.",
    );
  }

  return userQuery({
    account_id: account_id || client_account_id,
    query: {
      accounts: {
        // Any provided values must be non-empty in order for userQuery to SET values
        // instead of fetching them.
        //
        ...(username && { name: username }),
        ...(first_name && { first_name }),
        ...(last_name && { last_name }),
      },
    },
  });
}

export default apiRoute({
  setName: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Accounts", "Admin"],
    },
  })
    .input({
      contentType: "application/json",
      body: SetAccountNameInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: SetAccountNameOutputSchema,
      },
    ])
    .handler(handle),
});
