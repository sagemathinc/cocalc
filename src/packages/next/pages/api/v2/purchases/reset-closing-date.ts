/*
Set closing day to today (or 1 if today is >=29).
*/

import getAccountId from "lib/account/get-account";
import resetClosingDate from "@cocalc/server/purchases/reset-closing-date";
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
  await resetClosingDate(account_id);
  return OkStatus;
}
