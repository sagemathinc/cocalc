/*
Get pricing data for Hyperstack cloud.

This gets a json object that can be used to efficiently browse and get pricing data
about almost everything related to Hyperstack VM's, similar to the google-cloud/pricing-data.
*/

import getAccountId from "lib/account/get-account";
import getPricingData from "@cocalc/server/compute/cloud/hyperstack/pricing-data";

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
  if (!account_id) {
    throw Error("must be signed in");
  }

  return await getPricingData();
}
