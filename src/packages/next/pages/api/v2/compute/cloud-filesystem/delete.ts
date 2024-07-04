/*
Delete a cloud file system
*/

import getAccountId from "lib/account/get-account";
import { userDeleteCloudFilesystem } from "@cocalc/server/compute/cloud-filesystem/delete";
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
  const { id, lock } = getParams(req);

  await userDeleteCloudFilesystem({
    account_id,
    lock,
    id,
  });
  return { status: "ok" };
}
