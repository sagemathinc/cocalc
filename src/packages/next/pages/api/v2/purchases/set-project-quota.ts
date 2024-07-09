import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import setProjectQuota from "@cocalc/server/purchases/set-project-quota";
import { OkStatus } from "lib/api/status";

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
  if (account_id == null) {
    throw Error("must be signed in");
  }
  const { project_id, quota } = getParams(req);
  await setProjectQuota({ account_id, project_id, quota });
  return OkStatus;
}
