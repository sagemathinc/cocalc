/*
Edit properties of cloud file system
*/

import getAccountId from "lib/account/get-account";
import {
  userEditCloudFilesystem,
  FIELDS,
} from "@cocalc/server/compute/cloud-filesystem/edit";
import getParams from "lib/api/get-params";
import type { EditCloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";

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
  const params = getParams(req);
  const { id } = params;
  const opts: Partial<EditCloudFilesystem> = {};
  for (const field of FIELDS) {
    const x = params[field];
    if (x !== undefined) {
      opts[field] = x;
    }
  }

  return await userEditCloudFilesystem({
    ...(opts as EditCloudFilesystem),
    account_id,
    id,
  });
}
