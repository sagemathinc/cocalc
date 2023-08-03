import getAccountId from "lib/account/get-account";
import { getChargesThisMonthByService } from "@cocalc/server/purchases/get-charges";

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
  return await getChargesThisMonthByService(account_id);
}
