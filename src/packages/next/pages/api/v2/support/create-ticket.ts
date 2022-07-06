/*
Create a support ticket.
*/

import createSupportTicket from "@cocalc/server/support/create-ticket";
import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  const { options } = getParams(req);

  let url;
  try {
    const account_id = await getAccountId(req);
    url = await createSupportTicket({ ...options, account_id });
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
  res.json({ url });
}
