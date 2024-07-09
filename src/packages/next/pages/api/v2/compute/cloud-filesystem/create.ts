/*
Create a cloud file system
*/

import getAccountId from "lib/account/get-account";
import { createCloudFilesystem, Options } from "@cocalc/server/compute/cloud-filesystem/create";
import { FIELDS } from "@cocalc/server/compute/cloud-filesystem/get";
import type { CloudFilesystem } from "@cocalc/util/db-schema/cloud-filesystems";

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

  const params = getParams(req);
  const opts: Partial<CloudFilesystem> = {};
  for (const field of FIELDS) {
    const x = params[field];
    if (x !== undefined) {
      opts[field] = x;
    }
  }
  return await createCloudFilesystem({
    ...opts,
    account_id,
  } as Options);
}
