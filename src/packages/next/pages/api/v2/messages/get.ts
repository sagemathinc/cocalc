/*
Get your messages via an api
*/

import getAccountId from "lib/account/get-account";
import getParams from "lib/api/get-params";
import { SuccessStatus } from "lib/api/status";
import getMessages from "@cocalc/server/messages/get";
import throttle from "@cocalc/util/api/throttle";

export default async function handle(req, res) {
  try {
    const messages = await get(req);
    res.json({ ...SuccessStatus, messages });
  } catch (err) {
    res.json({ error: `${err.message ? err.message : err}` });
    return;
  }
}

async function get(req) {
  const account_id = await getAccountId(req);

  if (!account_id) {
    throw Error("Must be signed in to get messages");
  }

  throttle({
    account_id,
    endpoint: "messages/get",
  });
  const { limit, offset, type, cutoff } = getParams(req);
  return await getMessages({ account_id, limit, offset, type, cutoff });
}
