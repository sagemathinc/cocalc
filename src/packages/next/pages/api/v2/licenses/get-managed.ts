/*
Get all licenses that the signed in user manages.

See docs in @cocalc/server/licenses/get-managed.ts

Returns [License1, License2, ...] on success or {error:'a message'} on failure.
For the fields in the License objects, see @cocalc/server/licenses/get-managed.ts
*/

import getManagedLicenses, {
  License,
} from "@cocalc/server/licenses/get-managed";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  GetManagedLicensesInputSchema,
  GetManagedLicensesOutputSchema,
} from "lib/api/schema/licenses/get-managed";

async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req): Promise<License[]> {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    return [];
  }
  const { limit, skip } = getParams(req);
  return await getManagedLicenses(account_id, limit, skip);
}

export default apiRoute({
  getManaged: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Licenses"],
    },
  })
    .input({
      contentType: "application/json",
      body: GetManagedLicensesInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: GetManagedLicensesOutputSchema,
      },
    ])
    .handler(handle),
});
