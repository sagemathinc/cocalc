/*
Return the last and next closing dates for this user.
*/

import getAccountId from "lib/account/get-account";
import {
  getLastClosingDate,
  getNextClosingDate,
} from "@cocalc/server/purchases/closing-date";

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
  return {
    last: await getLastClosingDate(account_id),
    next: await getNextClosingDate(account_id),
  };
}
