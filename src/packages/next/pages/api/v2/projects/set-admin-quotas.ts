/*
API endpoint to set project quotas as admin.

This requires the user to be an admin.
*/

import userIsInGroup from "@cocalc/server/accounts/is-in-group";
import { setQuotas } from "@cocalc/server/conat/api/projects";
import getAccountId from "lib/account/get-account";
import { apiRoute, apiRouteOperation } from "lib/api";
import getParams from "lib/api/get-params";
import {
  SetAdminQuotasInputSchema,
  SetAdminQuotasOutputSchema,
} from "lib/api/schema/projects/set-admin-quotas";
import { SuccessStatus } from "lib/api/status";

async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const account_id = await getAccountId(req);
  if (account_id == null) {
    throw Error("must be signed in");
  }
  // This user MUST be an admin:
  if (!(await userIsInGroup(account_id, "admin"))) {
    throw Error("only admins can set project quotas");
  }

  const {
    project_id,
    memory_limit,
    memory_request,
    cpu_request,
    cpu_limit,
    disk_quota,
    idle_timeout,
    internet,
    member_host,
    always_running,
  } = getParams(req);

  await setQuotas({
    account_id,
    project_id,
    memory: memory_limit,
    memory_request,
    cpu_shares:
      cpu_request != null ? Math.round(cpu_request * 1024) : undefined,
    cores: cpu_limit,
    disk_quota,
    mintime: idle_timeout,
    network: internet != null ? (internet ? 1 : 0) : undefined,
    member_host: member_host != null ? (member_host ? 1 : 0) : undefined,
    always_running:
      always_running != null ? (always_running ? 1 : 0) : undefined,
  });

  return SuccessStatus;
}

export default apiRoute({
  setAdminQuotas: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Projects", "Admin"],
    },
  })
    .input({
      contentType: "application/json",
      body: SetAdminQuotasInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: SetAdminQuotasOutputSchema,
      },
    ])
    .handler(handle),
});
