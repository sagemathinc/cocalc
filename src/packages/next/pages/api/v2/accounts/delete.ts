/*
Delete the account that the user is currently signed in using.
*/

import getAccountId from "lib/account/get-account";
import deleteAccount from "@cocalc/server/accounts/delete";
import isPost from "lib/api/is-post";
import { apiRoute, apiRouteOperation } from "lib/api";
import { SuccessStatus } from "lib/api/status";
import { DeleteAccountOutputSchema } from "lib/api/schema/accounts/delete";

async function handle(req, res) {
  try {
    if (isPost(req, res)) {
      const account_id = await getAccountId(req);
      if (!account_id) {
        throw Error("must be signed in");
      }
      await deleteAccount(account_id);
      res.json(SuccessStatus);
    } else {
      throw Error("must be a POST request");
    }
  } catch (err) {
    res.json({ error: err.message });
  }
}

export default apiRoute({
  delete: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Accounts"],
    },
  })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: DeleteAccountOutputSchema,
      },
    ])
    .handler(handle),
});
