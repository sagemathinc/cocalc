/*
Get serial port output (since boot) for a compute server.

Any collaborator on the project containing the compute server has permission to get this serial output.
*/

import getAccountId from "lib/account/get-account";
import { getSerialPortOutput } from "@cocalc/server/compute/control";
import { getServerNoCheck } from "@cocalc/server/compute/get-servers";
import getParams from "lib/api/get-params";
import isCollaborator from "@cocalc/server/projects/is-collaborator";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  GetComputeServerSerialPortOutputInputSchema,
  GetComputeServerSerialPortOutputOutputSchema,
} from "lib/api/schema/compute/get-serial-port-output";

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
  if (!account_id) {
    throw Error("user must be signed in");
  }
  // id of the server
  const { id } = getParams(req);
  const server = await getServerNoCheck(id);

  if (
    !(await isCollaborator({
      account_id,
      project_id: server.project_id,
    }))
  ) {
    throw Error("must be a collaborator on project with compute server");
  }

  return await getSerialPortOutput({
    id,
    account_id: server.account_id, // actual compute server owner
  });
}

export default apiRoute({
  getSerialPortOutput: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"],
    },
  })
    .input({
      contentType: "application/json",
      body: GetComputeServerSerialPortOutputInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: GetComputeServerSerialPortOutputOutputSchema,
      },
    ])
    .handler(handle),
});
