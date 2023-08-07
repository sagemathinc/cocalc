/*
Let user get all of their purchase quotas.
*/

import getParams from "lib/api/get-params";
import getServiceCost from "@cocalc/server/purchases/get-service-cost";

export default async function handle(req, res) {
  try {
    res.json(await get(req));
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get(req) {
  const { service } = getParams(req);
  return await getServiceCost(service);
}
