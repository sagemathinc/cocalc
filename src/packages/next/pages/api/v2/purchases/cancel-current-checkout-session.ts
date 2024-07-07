/*
Get the current stripe checkout session {session:{id:?, url:?}}, if there is one that is
currently open or {session:null} if not.  Everytime this is called, it checks with
stripe for the status of the session, and if the session is no longer open (due to being
paid or expiring), removes the entry from the database.
*/

import getAccountId from "lib/account/get-account";
import { cancelCurrentSession } from "@cocalc/server/purchases/create-stripe-checkout-session";
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
  await cancelCurrentSession(account_id);
  return OkStatus;
}
