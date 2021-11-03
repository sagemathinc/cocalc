/*
Get all support tickets for a signed in user.
*/

import getSupportTickets from "@cocalc/server/support/get-tickets";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  if (req.method !== "POST") {
    res.status(404).json({ message: "must use a POST request." });
    return;
  }
  const account_id = await getAccountId(req);
  if (account_id == null) {
    res.json({ error: "you must be signed in to get support tickets" });
    return;
  }

  let tickets;
  try {
    tickets = await getSupportTickets(account_id);
  } catch (err) {
    res.json({ error: `${err}` });
    return;
  }
  res.json({ tickets });
}
