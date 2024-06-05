/*
Create a shared storage volume
*/

import getAccountId from "lib/account/get-account";
import createStorage from "@cocalc/server/compute/create-storage";
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
    configuration,
    title,
    color,
    notes,
  } = getParams(req);

  return await createStorage({
    account_id,
    project_id,
    mountpoint,
    compression,
    configuration,
    title,
    color,
    notes,
  });
}
