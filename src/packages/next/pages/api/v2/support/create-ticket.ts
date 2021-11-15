/*
Create a support ticket.
*/

import createSupportTicket from "@cocalc/server/support/create-ticket";
import getAccountId from "lib/account/get-account";

export default async function handle(req, res) {
  if (req.method !== "POST") {
    res.status(404).json({ message: "must use a POST request." });
    return;
  }

  const { options } = req.body;

  let url;
  try {
    const account_id = await getAccountId(req);
    url = await createSupportTicket({ ...options, account_id });
  } catch (err) {
    res.json({ error: `${err}` });
    return;
  }
  res.json({ url });
}
