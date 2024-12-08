/*
Let user get purchase quotas.

service - a single service name or an array of service names.
        - if array, returns map from service name to cost.
*/

import getParams from "lib/api/get-params";
import getServiceCost from "@cocalc/server/purchases/get-service-cost";
import { is_array } from "@cocalc/util/misc";
import { zipObject } from "lodash";

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
  if (is_array(service)) {
    const v = await Promise.all(service.map(getServiceCost));
    return zipObject(service, v);
  } else {
    return await getServiceCost(service);
  }
}
