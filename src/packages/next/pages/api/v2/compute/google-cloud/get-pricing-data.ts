/*
Get pricing data.

This gets a json object that can be used to efficiently browse and get pricing data
about almost everything related to Google Cloud VM's.  The idea is that this
is useful in itself, and also the module
  @cocalc/util/compute/cloud/google-cloud/compute-cost
can run on the frontend, and takes this data to quickly compute total cost per hour
of a configuration.

We only allow api requests for signed in users to avoid abuse.
*/

import getAccountId from "lib/account/get-account";
import getPricingData from "@cocalc/server/compute/cloud/google-cloud/pricing-data";

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
