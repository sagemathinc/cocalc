/*
Edit properties of cloud filesystem
*/

import getAccountId from "lib/account/get-account";
import { userEditCloudFilesystem } from "@cocalc/server/compute/cloud-filesystem/edit";
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
  const {
    id,
    project_id,
    mountpoint,
    mount,
    configuration,
    title,
    color,
    notes,
  } = getParams(req);

  return await userEditCloudFilesystem({
    id,
    project_id,
    account_id,
    mountpoint,
    mount,
    configuration,
    title,
    color,
    notes,
  });
}
