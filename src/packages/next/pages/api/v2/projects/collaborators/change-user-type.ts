/*
API endpoint to change a user's collaborator type on an existing project.

Permissions checks are performed by the underlying API call and are NOT
executed at this stage.

*/
import { changeUserType } from "@cocalc/server/projects/collaborators";

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { apiRoute, apiRouteOperation } from "lib/api";
import { OkStatus } from "lib/api/status";
import {
  ChangeProjectUserTypeInputSchema,
  ChangeProjectUserTypeOutputSchema,
} from "lib/api/schema/projects/collaborators/change-user-type";

async function handle(req, res) {
  const { project_id, target_account_id, new_group } = getParams(req);
  const client_account_id = await getAccountId(req);

  try {
    if (!client_account_id) {
      throw Error("must be signed in");
    }

    await changeUserType({
      account_id: client_account_id,
      opts: { project_id, target_account_id, new_group },
    });

    res.json(OkStatus);
  } catch (err) {
    res.json({ error: err.message });
  }
}

export default apiRoute({
  changeProjectUserType: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Projects", "Admin"],
    },
  })
    .input({
      contentType: "application/json",
      body: ChangeProjectUserTypeInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: ChangeProjectUserTypeOutputSchema,
      },
    ])
    .handler(handle),
});
