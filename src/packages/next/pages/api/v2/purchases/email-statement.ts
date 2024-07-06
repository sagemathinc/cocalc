/*
Email a specific statement to the user.  Error if this statement has been emailed to this user
within the last 6 hours.
*/

import getAccountId from "lib/account/get-account";
import emailStatement from "@cocalc/server/purchases/statements/email-statement";
import getParams from "lib/api/get-params";
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
  const { statement_id } = getParams(req);
  await emailStatement({ account_id, statement_id });
  return OkStatus;
}
