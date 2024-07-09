/*
Set password for an existing account.
*/

import setPassword from "@cocalc/server/accounts/set-password";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import { SuccessStatus } from "lib/api/status";
import {
  SetAccountPasswordInputSchema,
  SetAccountPasswordOutputSchema,
} from "lib/api/schema/accounts/set-password";

async function handle(req, res) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    res.json({ error: "must be signed in" });
    return;
  }
  const { currentPassword, newPassword } = getParams(req);
  try {
    await setPassword(account_id, currentPassword, newPassword);
    res.json(SuccessStatus);
  } catch (err) {
    res.json({ error: err.message });
  }
}

export default apiRoute({
  setPassword: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Accounts"],
    },
  })
    .input({
      contentType: "application/json",
      body: SetAccountPasswordInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: SetAccountPasswordOutputSchema,
      },
    ])
    .handler(handle),
});
