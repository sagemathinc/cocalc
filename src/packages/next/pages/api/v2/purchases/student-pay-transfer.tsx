import getAccountId from "lib/account/get-account";
import { studentPayTransfer } from "@cocalc/server/purchases/student-pay";
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
  if (account_id == null) {
    throw Error("must be signed in");
  }
  const { project_id, paid_project_id } = getParams(req);
  await studentPayTransfer({
    account_id,
    project_id,
    paid_project_id,
  });
  return {};
}
