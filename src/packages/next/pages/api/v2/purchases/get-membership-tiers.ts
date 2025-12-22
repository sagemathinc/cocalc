/*
Return membership tier configuration for the store UI.
*/

import { getMembershipTiers } from "@cocalc/server/membership/tiers";

export default async function handle(_req, res) {
  try {
    res.json(await get());
  } catch (err) {
    res.json({ error: `${err.message}` });
    return;
  }
}

async function get() {
  return { tiers: await getMembershipTiers({ includeDisabled: true }) };
}
