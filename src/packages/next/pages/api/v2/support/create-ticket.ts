/*
Create a support ticket.
*/

import createSupportTicket from "@cocalc/server/support/create-ticket";
import getAccountId from "lib/account/get-account";
import isPost from "lib/api/is-post";

export default async function handle(req, res) {
  if (!isPost(req, res)) return;

  const { options } = req.body;

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
