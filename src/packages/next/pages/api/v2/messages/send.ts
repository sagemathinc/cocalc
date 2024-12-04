/*
Send an internal message to any one or more user of the site.
*/

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { SuccessStatus } from "lib/api/status";
import send from "@cocalc/server/messages/send";
import throttle from "@cocalc/util/api/throttle";

export default async function handle(req, res) {
  try {
    const id = await get(req);
    res.json({ ...SuccessStatus, id });
  } catch (err) {
    res.json({ error: `${err.message ? err.message : err}` });
    return;
  }
}

async function get(req) {
  const from_id = await getAccountId(req);

  if (!from_id) {
    throw Error("Must be signed in to send messages");
  }

  throttle({
    account_id: from_id,
    endpoint: "messages/send",
  });
  const { to_ids, subject, body, reply_id } = getParams(req);
  return await send({
    to_ids: to_ids ?? [from_id],
    from_id,
    subject,
    body,
    reply_id,
  });
}
