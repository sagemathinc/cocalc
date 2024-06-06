/*
Create a cloud filesystem
*/

import getAccountId from "lib/account/get-account";
import { createCloudFilesystem } from "@cocalc/server/compute/cloud-filesystem/create";
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
    project_id,
    mountpoint,
    compression,
    mount_options,
    keydb_options,
    block_size,
    title,
    color,
    notes,
  } = getParams(req);

  return await createCloudFilesystem({
    account_id,
    project_id,
    mountpoint,
    compression,
    mount_options,
    keydb_options,
    block_size,
    title,
    color,
    notes,
  });
}
