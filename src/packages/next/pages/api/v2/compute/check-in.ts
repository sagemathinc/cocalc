/*
Compute server periodically checking in with cocalc using a project api key.

Example use, where 'sk-eTUKbl2lkP9TgvFJ00001n' is a project api key.

curl -sk -u sk-eTUKbl2lkP9TgvFJ00001n: -d '{"id":"13"}' -H 'Content-Type: application/json' https://cocalc.com/api/v2/compute/check-in

Calling this endpoint:

- sets detailed state saying the vm is ready
- optionally returns vpn and/or storage config, if input vpn_sha1 or storage_sha1 doesn't match
  current value.

If compute server gets back vpn_sha1 or storage_sha1, it should update its local
configuration accordingly.
*/

import getProjectOrAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { checkIn } from "@cocalc/server/compute/check-in";

export default async function handle(req, res) {
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
  const { id, vpn_sha1, storage_sha1 } = getParams(req);

  return await checkIn({
    project_id,
    id,
    vpn_sha1,
    storage_sha1,
  });
}
