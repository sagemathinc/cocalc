/*
Get a list of cloud file systems:

- all cloud file systems that you own across all projects - no params
- all cloud file systems in a particular project (whether or not you own them) - specify project_id
- a specific cloud file system - specify id

Always returns an array of cloud file system objects.
*/

import getAccountId from "lib/account/get-account";
import { userGetCloudFilesystems } from "@cocalc/server/compute/cloud-filesystem/get";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
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
    throw Error("must be signed in");
  }
  const { id, project_id } = getParams(req);

  return await userGetCloudFilesystems({
    id,
    account_id,
    project_id,
  });
}
