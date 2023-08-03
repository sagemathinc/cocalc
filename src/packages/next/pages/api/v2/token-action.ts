/*
Handle a token action.
*/

import handleTokenAction from "@cocalc/server/token-actions/handle";
import getParams from "lib/api/get-params";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const { token } = getParams(req);
  return await handleTokenAction(token);
}
