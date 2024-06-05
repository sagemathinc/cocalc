/*
Create a shared storage volume
*/

import getAccountId from "lib/account/get-account";
import { userDeleteStorage } from "@cocalc/server/compute/delete-storage";
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

  await userDeleteStorage({
    account_id,
    lock,
    id,
  });
  return { status: "ok" };
}
