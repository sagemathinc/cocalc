/* Get projects that the authenticated user is a collaborator on. */

import getProjects from "@cocalc/server/projects/get";
import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { apiRoute, apiRouteOperation } from "lib/api";

import {
  GetAccountProjectsInputSchema,
  GetAccountProjectsOutputSchema,
} from "lib/api/schema/projects/get";

async function handle(req, res) {
  const client_account_id = await getAccountId(req);
  try {
    if (client_account_id == null) {
      throw Error("Must be signed in.");
    }

    const { account_id, limit } = getParams(req);

    // User must be an admin to specify account_id field
    //
    if (account_id && !(await userIsInGroup(client_account_id, "admin"))) {
      throw Error(
        "The `account_id` field may only be specified by account administrators.",
      );
    }

    res.json(
      await getProjects({
        account_id: account_id || client_account_id,
        limit,
      }),
    );
  } catch (err) {
    res.json({ error: err.message });
  }
}

export default apiRoute({
  getProject: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Projects", "Admin"],
    },
  })
    .input({
      contentType: "application/json",
      body: GetAccountProjectsInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: GetAccountProjectsOutputSchema,
      },
    ])
    .handler(handle),
});
