/*
Compute server periodically checking in with cocalc using a project api key.

Example use, where 'sk-eTUKbl2lkP9TgvFJ00001n' is a project api key.

curl -sk -u sk-eTUKbl2lkP9TgvFJ00001n: -d '{"id":"13","vpn_sha1":"fbdad59e0793e11ffa464834c647db93d1f9ec99","cloud_filesystem_sha1":"97d170e1550eee4afc0af065b78cda302a97674c"}' -H 'Content-Type: application/json' https://cocalc.com/api/v2/compute/check-in

Calling this endpoint:

- sets detailed state saying the vm is ready
- optionally returns vpn and/or cloud file system config, if input vpn_sha1 or cloud_filesystem_sha1 doesn't match
  current value.

If compute server gets back vpn_sha1 or cloud_filesystem_sha1, it should update its local
configuration accordingly.
*/

import getProjectOrAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { checkIn } from "@cocalc/server/compute/check-in";

import { apiRoute, apiRouteOperation } from "lib/api";
import {
  ComputeServerCheckInInputSchema,
  ComputeServerCheckInOutputSchema,
} from "lib/api/schema/compute/check-in";


async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const project_id = await getProjectOrAccountId(req);
  if (!project_id) {
    throw Error("invalid auth");
  }
  const { id, vpn_sha1, cloud_filesystem_sha1 } = getParams(req);

  return await checkIn({
    project_id,
    id,
    vpn_sha1,
    cloud_filesystem_sha1,
  });
}

export default apiRoute({
  checkIn: apiRouteOperation({
    method: "POST",
    openApiOperation: {
      tags: ["Compute"]
    },
  })
    .input({
      contentType: "application/json",
      body: ComputeServerCheckInInputSchema,
    })
    .outputs([
      {
        status: 200,
        contentType: "application/json",
        body: ComputeServerCheckInOutputSchema,
      },
    ])
    .handler(handle),
});
