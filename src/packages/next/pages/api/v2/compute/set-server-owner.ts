import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { OkStatus } from "lib/api/status";
import setServerOwner from "@cocalc/server/compute/set-server-owner";

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
  const { id, new_account_id } = getParams(req);
  await setServerOwner({
    account_id,
    id,
    new_account_id,
  });
  return OkStatus;
}
